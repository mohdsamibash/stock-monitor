// Minimal robots.txt support: fetches once per origin, honours "User-agent: *" (and a
// KW-StockMonitor group if present) Allow/Disallow rules with * and $ wildcards.
import { logger } from './log.js';

const log = logger('robots');
const cache = new Map(); // origin -> { rules: [{allow, pattern}] , crawlDelay }

function toRegex(pattern) {
  const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + (esc.endsWith('\\$') ? esc.slice(0, -2) + '$' : esc));
}

function parse(txt) {
  const groups = [];
  let cur = null;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || cur.rulesStarted) { cur = { agents: [], rules: [], rulesStarted: false }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
    } else if (cur && (key === 'allow' || key === 'disallow')) {
      cur.rulesStarted = true;
      if (val) cur.rules.push({ allow: key === 'allow', pattern: val, re: toRegex(val), len: val.length });
    } else if (cur && key === 'crawl-delay') {
      cur.rulesStarted = true;
      cur.crawlDelay = Number(val) || undefined;
    }
  }
  return groups;
}

export async function loadRobots(origin, fetchImpl, ua) {
  if (cache.has(origin)) return cache.get(origin);
  let entry = { rules: [], crawlDelay: undefined };
  try {
    const res = await fetchImpl(origin + '/robots.txt', { headers: { 'user-agent': ua }, signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const groups = parse(await res.text());
      const mine = groups.find((g) => g.agents.some((a) => a.includes('kw-stockmonitor')));
      const star = groups.find((g) => g.agents.includes('*'));
      const g = mine || star;
      if (g) entry = { rules: g.rules, crawlDelay: g.crawlDelay };
    }
  } catch (e) {
    log.debug(`robots.txt unavailable for ${origin}: ${e.message}`);
  }
  cache.set(origin, entry);
  return entry;
}

export function isAllowed(entry, pathWithQuery) {
  // Longest matching rule wins (Google semantics); tie -> allow.
  let best = null;
  for (const r of entry.rules) {
    if (r.re.test(pathWithQuery)) {
      if (!best || r.len > best.len || (r.len === best.len && r.allow)) best = r;
    }
  }
  return best ? best.allow : true;
}
