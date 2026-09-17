// Run history (data/history.jsonl) and diffing between passes.
import fs from 'node:fs';
import readline from 'node:readline';
import { HISTORY_FILE, appendJsonl } from './lib/paths.js';
import { STATUS } from '../config/variants.js';

// Compact snapshot: { "<siteId>": { "<variantKey>": [status, priceKWD] } }
export function snapshotOf(stock) {
  const snap = {};
  for (const site of stock.sites) {
    if (site.linkOnly) continue;
    snap[site.id] = {};
    for (const r of site.results) snap[site.id][r.key] = [r.status, r.priceKWD ?? null];
  }
  return snap;
}

export function diffSnapshots(prev, next) {
  const changes = [];
  if (!prev) return changes;
  for (const [siteId, variants] of Object.entries(next)) {
    for (const [key, [status, price]] of Object.entries(variants)) {
      const before = prev[siteId]?.[key];
      if (!before) continue; // first sighting: not a flip
      const [pStatus, pPrice] = before;
      if (pStatus !== status || (price != null && pPrice != null && pPrice !== price)) {
        changes.push({ siteId, key, from: pStatus, to: status, priceFrom: pPrice, priceTo: price });
      }
    }
  }
  return changes;
}

// ALERT_ON=any-in-stock (default): every transition INTO IN_STOCK, including a variant that appears for the
// first time as in stock (NOT_LISTED -> IN_STOCK) or recovers from ERROR.
// ALERT_ON=restock: strictly OUT_OF_STOCK -> IN_STOCK.
export function restockTransitions(changes, mode = "any-in-stock") {
  return changes.filter((c) => c.to === STATUS.IN_STOCK && c.from !== STATUS.IN_STOCK && (mode !== "restock" || c.from === STATUS.OUT_OF_STOCK));
}

export function appendRun(entry) {
  appendJsonl(HISTORY_FILE, entry);
}

// Streams history lines newer than `sinceMs` (default: 24 h).
export async function readHistory({ sinceMs = Date.now() - 86_400_000 } = {}) {
  const out = [];
  if (!fs.existsSync(HISTORY_FILE)) return out;
  const rl = readline.createInterface({ input: fs.createReadStream(HISTORY_FILE), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (new Date(e.ts).getTime() >= sinceMs) out.push(e);
    } catch { /* skip corrupt line */ }
  }
  return out;
}

// Per-variant availability windows from history entries (for the UI + daily digest).
export function availabilityWindows(entries) {
  const open = new Map(); // siteId|key -> startTs
  const windows = [];
  for (const e of entries) {
    for (const [siteId, variants] of Object.entries(e.snapshot || {})) {
      for (const [key, [status]] of Object.entries(variants)) {
        const id = `${siteId}|${key}`;
        if (status === STATUS.IN_STOCK && !open.has(id)) open.set(id, e.ts);
        if (status !== STATUS.IN_STOCK && open.has(id)) {
          windows.push({ siteId, key, from: open.get(id), to: e.ts });
          open.delete(id);
        }
      }
    }
  }
  for (const [id, from] of open) {
    const [siteId, ...rest] = id.split('|');
    windows.push({ siteId, key: rest.join('|'), from, to: null });
  }
  return windows;
}
