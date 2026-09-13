// One full pass across all retailers: discover -> per-model matrix -> stock.json -> history -> alerts -> AI hooks.
import { MODELS, STATUS, allVariants } from '../config/variants.js';
import { SITES } from './sites/index.js';
import { logger } from './lib/log.js';
import { readJson, writeJson, STOCK_FILE, STATE_FILE } from './lib/paths.js';
import { resetPassCounter, passRequestCount, requestsPerHour } from './lib/http.js';
import { snapshotOf, diffSnapshots, restockTransitions, appendRun } from './history.js';
import { sendAlert } from './alerts/index.js';
import { ENV } from './lib/env.js';
import { composeAlert } from './ai/alerts.js';
import { aiAfterPass } from './ai/index.js';
import { publishStock, fetchPublishedBundle } from './publish.js';
import { errorMatrix } from './sites/base.js';

const log = logger('runner');
let running = null;

const BACKOFF_BASE_MS = 10 * 60_000; // 10, 20, 40, 80, 160, 320 min
const BACKOFF_MAX_LEVEL = 6;

export function loadState() { return readJson(STATE_FILE, { backoff: {}, ai: {}, consecutiveErrors: {} }); }
export function saveState(state) { writeJson(STATE_FILE, state); }

/** Serialised: concurrent callers share the in-flight pass. */
export function runPass(opts = {}) {
  if (running) return running;
  running = doPass(opts).finally(() => { running = null; });
  return running;
}

async function doPass({ profile = { profile: 'manual', intervalMinutes: null, reason: 'one-off' }, trigger = 'cli' } = {}) {
  const started = Date.now();
  const state = loadState();
  if (!state.lastSnapshot) {
    // Fresh machine (e.g. GitHub Actions without a cache hit): diff against what the website last showed.
    const prev = await fetchPublishedBundle();
    if (prev?.stock) { state.lastSnapshot = snapshotOf(prev.stock); state.carryChanges = prev.history?.changes || []; log.info('seeded last snapshot from the published bundle'); }
  }
  resetPassCounter();
  const sites = [];

  for (const site of SITES) {
    const bo = state.backoff[site.id];
    const checkedAt = new Date().toISOString();
    if (bo?.until && new Date(bo.until).getTime() > Date.now()) {
      log.warn(`${site.id}: in back-off until ${bo.until} (${bo.lastError}); skipping`);
      sites.push({ id: site.id, name: site.name, baseUrl: site.baseUrl, status: 'backoff', error: `Backing off until ${bo.until}: ${bo.lastError}`, checkedAt, results: MODELS.flatMap((m) => errorMatrix(m, 'back-off', checkedAt)) });
      continue;
    }
    const before = passRequestCount();
    try {
      const disc = await site.discover();
      const results = [];
      for (const m of MODELS) {
        const rows = await site.checkModel(m);
        for (const r of rows) results.push({ modelId: m.id, ...r });
      }
      state.backoff[site.id] = { level: 0 };
      state.consecutiveErrors[site.id] = 0;
      sites.push({ id: site.id, name: site.name, baseUrl: site.baseUrl, status: 'ok', source: disc.source, listings: disc.listings, resolved: disc.resolved, requests: passRequestCount() - before, checkedAt, results });
    } catch (e) {
      const blocked = Boolean(e.blocked);
      state.consecutiveErrors[site.id] = (state.consecutiveErrors[site.id] || 0) + 1;
      let msg = e.message;
      if (blocked || state.consecutiveErrors[site.id] >= 3) {
        const level = Math.min((bo?.level || 0) + 1, BACKOFF_MAX_LEVEL);
        const until = new Date(Date.now() + BACKOFF_BASE_MS * 2 ** (level - 1)).toISOString();
        state.backoff[site.id] = { level, until, lastError: e.message };
        msg += ` — backing off (level ${level}) until ${until}`;
      }
      log.error(`${site.id}: ${msg}`);
      sites.push({ id: site.id, name: site.name, baseUrl: site.baseUrl, status: 'error', error: msg, blocked, requests: passRequestCount() - before, checkedAt, results: MODELS.flatMap((m) => errorMatrix(m, e.message, checkedAt)) });
    }
  }

  const stock = {
    generatedAt: new Date().toISOString(),
    trigger,
    profile,
    pass: { durationMs: Date.now() - started, requests: passRequestCount(), requestsPerHour: requestsPerHour() },
    models: MODELS,
    retailers: SITES.map((s) => ({ id: s.id, name: s.name, baseUrl: s.baseUrl })),
    sites,
    summary: summarize(sites),
    changes: [],
  };

  const snapshot = snapshotOf(stock);
  const changes = diffSnapshots(state.lastSnapshot, snapshot);
  stock.changes = changes;
  appendRun({ ts: stock.generatedAt, trigger, profile: profile.profile, requests: stock.pass.requests, changes, snapshot });
  state.lastSnapshot = snapshot;
  state.lastRunAt = stock.generatedAt;
  // rolling 24 h change list that survives machines without a persistent history file
  const cutoff = Date.now() - 86_400_000;
  state.carryChanges = [...(state.carryChanges || []), ...changes.map((c) => ({ ts: stock.generatedAt, ...c }))].filter((c) => new Date(c.ts).getTime() >= cutoff).slice(-300);
  writeJson(STOCK_FILE, stock);
  saveState(state);
  await publishStock(stock, state.carryChanges); // website (no-op unless PUBLISH_URL is set)

  log.info(`pass done: ${stock.summary.inStock}/${stock.summary.total} in stock, ${changes.length} changes, ${stock.pass.requests} requests, ${stock.pass.durationMs} ms`);

  const restocks = confirmTransitions(restockTransitions(changes, ENV.ALERT_ON), state, snapshot);
  if (restocks.length) {
    log.info(`${restocks.length} restock transition(s): ${restocks.map((c) => `${c.siteId} ${c.key}`).join('; ')}`);
    try {
      const text = await composeAlert(restocks, stock);
      const first = stock.sites.find((s) => s.id === restocks[0].siteId)?.results.find((x) => x.key === restocks[0].key);
      await sendAlert({ title: `In stock at ${stock.retailers.find((x) => x.id === restocks[0].siteId)?.name || restocks[0].siteId}`, text, url: first?.url || undefined });
    } catch (e) { log.warn(`alert failed: ${e.message}`); }
  }
  try { await aiAfterPass(stock, state); saveState(state); } catch (e) { log.warn(`AI hooks failed: ${e.message}`); }
  return stock;
}

// Flap protection: with ALERT_CONFIRM_PASSES=n a variant must be IN_STOCK for n consecutive passes before it
// alerts (n=1 alerts immediately). Pending candidates are kept in state.pendingAlerts.
export function confirmTransitions(transitions, state, snapshot) {
  const need = Math.max(1, ENV.ALERT_CONFIRM_PASSES);
  state.pendingAlerts = state.pendingAlerts || {};
  const out = [];
  for (const t of transitions) {
    const id = t.siteId + "|" + t.key;
    if (need === 1) { out.push(t); continue; }
    state.pendingAlerts[id] = { count: 1, t };
  }
  if (need > 1) {
    for (const [id, p] of Object.entries(state.pendingAlerts)) {
      const [siteId, ...rest] = id.split("|");
      const now = snapshot[siteId]?.[rest.join("|")]?.[0];
      if (now !== "IN_STOCK") { delete state.pendingAlerts[id]; continue; }
      if (!transitions.some((t) => t.siteId + "|" + t.key === id)) p.count++;
      if (p.count >= need) { out.push(p.t); delete state.pendingAlerts[id]; }
    }
  }
  return out;
}

export function summarize(sites) {
  const byRetailer = {};
  let inStock = 0, total = 0;
  for (const s of sites) {
    const c = { inStock: 0, outOfStock: 0, notListed: 0, error: 0 };
    for (const r of s.results) {
      total++;
      if (r.status === STATUS.IN_STOCK) { c.inStock++; inStock++; }
      else if (r.status === STATUS.OUT_OF_STOCK) c.outOfStock++;
      else if (r.status === STATUS.NOT_LISTED) c.notListed++;
      else c.error++;
    }
    byRetailer[s.id] = c;
  }
  // cheapest in-stock retailer per variant
  const cheapest = {};
  for (const v of allVariants()) {
    let best = null;
    for (const s of sites) {
      const r = s.results.find((x) => x.key === v.key);
      if (r?.status === STATUS.IN_STOCK && r.priceKWD != null && (!best || r.priceKWD < best.priceKWD)) best = { siteId: s.id, priceKWD: r.priceKWD };
    }
    if (best) cheapest[v.key] = best;
  }
  return { inStock, total, variants: allVariants().length, byRetailer, cheapest };
}
