// Publishes the latest pass to the public website (Cloudflare Pages Function + KV) so
// mohdbash.com/iphone18 can show live data while the scraper keeps running on this Mac.
// Best effort: never throws into the runner. Configure PUBLISH_URL + PUBLISH_TOKEN in .env.
import { ENV } from './lib/env.js';
import { logger } from './lib/log.js';
import { readHistory, availabilityWindows } from './history.js';
import { pickProfile } from './schedule.js';
import { requestsPerHour } from './lib/http.js';

const log = logger('publish');

export function publishConfigured() { return Boolean(ENV.PUBLISH_URL && ENV.PUBLISH_TOKEN); }
const refreshUrl = () => ENV.PUBLISH_URL.replace(/\/api\/stock\/?$/, '/api/refresh');

/** true when someone pressed Refresh on the public website */
export async function remoteRefreshPending() {
  if (!publishConfigured()) return false;
  try {
    const res = await fetch(refreshUrl(), { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!res.ok) return false;
    return Boolean((await res.json()).pending);
  } catch { return false; }
}

async function clearRemoteRefresh() {
  try { await fetch(refreshUrl(), { method: 'DELETE', headers: { authorization: `Bearer ${ENV.PUBLISH_TOKEN}` }, signal: AbortSignal.timeout(10000) }); } catch { /* best effort */ }
}

export async function fetchPublishedBundle() {
  if (!ENV.PUBLISH_URL) return null;
  try { const res = await fetch(ENV.PUBLISH_URL, { cache: 'no-store', signal: AbortSignal.timeout(15000) }); return res.ok ? await res.json() : null; }
  catch { return null; }
}

export async function buildBundle(stock, carryChanges = []) {
  const entries = await readHistory({ sinceMs: Date.now() - 86_400_000 });
  const local = entries.flatMap((e) => (e.changes || []).map((c) => ({ ts: e.ts, ...c })));
  const seen = new Set();
  const changes = [...carryChanges, ...local].filter((c) => { const k = `${c.ts}|${c.siteId}|${c.key}`; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.ts.localeCompare(b.ts)).slice(-300);
  const profile = pickProfile(new Date());
  // Trim per-result fields the public page does not need.
  const slim = { ...stock, sites: stock.sites.map((s) => ({ ...s, results: s.results.map(({ title, ...r }) => r) })) };
  return {
    publishedAt: new Date().toISOString(),
    stock: slim,
    status: { profile, nextRunAt: new Date(Date.now() + profile.intervalMinutes * 60_000).toISOString(), requestsPerHour: requestsPerHour() },
    history: { hours: 24, runs: entries.length, changes, windows: availabilityWindows(entries) },
  };
}

export async function publishStock(stock, carryChanges = []) {
  if (!publishConfigured()) return false;
  try {
    const bundle = await buildBundle(stock, carryChanges);
    const res = await fetch(ENV.PUBLISH_URL, {
      method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${ENV.PUBLISH_TOKEN}` },
      body: JSON.stringify(bundle), signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) { log.warn(`publish failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`); return false; }
    log.info(`published to ${ENV.PUBLISH_URL} (${Math.round(JSON.stringify(bundle).length / 1024)} KB)`);
    await clearRemoteRefresh();
    return true;
  } catch (e) { log.warn(`publish error: ${e.message}`); return false; }
}
