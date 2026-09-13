// Polite HTTP client: UA, 20s timeout, retry with backoff, max N concurrent per domain,
// 2-4s pacing between requests, robots.txt, per-domain hourly request accounting, and
// 429/403 detection that the runner turns into a per-retailer exponential back-off.
import { ENV } from './env.js';
import { logger } from './log.js';
import { loadRobots, isAllowed } from './robots.js';
import { sleep, randomBetween } from './time.js';
import { readJson, writeJson, REQUEST_LOG_FILE } from './paths.js';

const log = logger('http');

export class HttpError extends Error {
  constructor(message, { status, url, blocked = false, robots = false } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status; this.url = url; this.blocked = blocked; this.robots = robots;
  }
}

const robotsWarned = new Set();
function warnRobotsOnce(host, pathname) {
  const key = host + pathname.replace(/\d+/g, "N");
  if (robotsWarned.has(key)) return;
  robotsWarned.add(key);
  log.warn(`robots.txt on ${host} disallows ${pathname}; calling it anyway because the adapter explicitly opted in (see .env)`);
}

// ---------- per-domain state ----------
const domains = new Map();
function domainState(host) {
  if (!domains.has(host)) domains.set(host, { active: 0, queue: [], lastStart: 0, stamps: [] });
  return domains.get(host);
}

// hourly accounting persisted so `watch` restarts don't lose the picture
const persisted = readJson(REQUEST_LOG_FILE, {});
function record(host) {
  const now = Date.now();
  const st = domainState(host);
  st.stamps.push(now);
  st.stamps = st.stamps.filter((t) => now - t < 3600_000);
  persisted[host] = (persisted[host] || []).filter((t) => now - t < 3600_000);
  persisted[host].push(now);
  try { writeJson(REQUEST_LOG_FILE, persisted); } catch { /* ignore */ }
  if (persisted[host].length > ENV.REQUESTS_PER_HOUR_WARN) {
    log.warn(`⚠ ${host} exceeded ${ENV.REQUESTS_PER_HOUR_WARN} requests in the last hour (${persisted[host].length})`);
  }
}

export function requestsPerHour() {
  const now = Date.now();
  const out = {};
  for (const [host, stamps] of Object.entries(persisted)) {
    const n = stamps.filter((t) => now - t < 3600_000).length;
    if (n) out[host] = n;
  }
  return out;
}

// Pass-level counter (reset by the runner)
let passCount = 0;
export function resetPassCounter() { passCount = 0; }
export function passRequestCount() { return passCount; }

async function acquire(host) {
  const st = domainState(host);
  if (st.active >= ENV.MAX_CONCURRENT_PER_DOMAIN) {
    await new Promise((resolve) => st.queue.push(resolve));
  }
  st.active++;
  // pacing: 2-4 s between request starts on the same domain
  const gap = randomBetween(ENV.MIN_DELAY_MS, ENV.MAX_DELAY_MS);
  const wait = st.lastStart + gap - Date.now();
  if (st.lastStart && wait > 0) await sleep(wait);
  st.lastStart = Date.now();
}
function release(host) {
  const st = domainState(host);
  st.active--;
  const next = st.queue.shift();
  if (next) next();
}

/**
 * fetchPolite(url, { method, headers, body, retries, expect: 'json'|'text', siteId })
 * Resolves to { status, headers, body (parsed), text }.
 * Throws HttpError with blocked=true on 429/403 (after retries), robots=true when disallowed.
 */
export async function fetchPolite(url, opts = {}) {
  const u = new URL(url);
  const host = u.host;
  const retries = opts.retries ?? 2;
  const headers = { 'user-agent': ENV.USER_AGENT, accept: opts.expect === 'json' ? 'application/json, text/plain, */*' : 'text/html,application/json;q=0.9,*/*;q=0.8', 'accept-language': 'en-KW,en;q=0.9,ar;q=0.8', ...(opts.headers || {}) };

  const robots = await loadRobots(u.origin, fetch, ENV.USER_AGENT);
  if (!isAllowed(robots, u.pathname + u.search)) {
    if (!opts.ignoreRobots) throw new HttpError(`robots.txt disallows ${u.pathname}`, { url, robots: true });
    warnRobotsOnce(host, u.pathname);
  }

  let attempt = 0; let lastErr;
  while (attempt <= retries) {
    await acquire(host);
    const started = Date.now();
    try {
      passCount++;
      record(host);
      const res = await fetch(url, { method: opts.method || 'GET', headers, body: opts.body, signal: AbortSignal.timeout(ENV.REQUEST_TIMEOUT_MS), redirect: 'follow' });
      const text = await res.text();
      log.debug(`${opts.method || 'GET'} ${url} -> ${res.status} (${Date.now() - started} ms, ${text.length} B)`);
      if (res.status === 429 || res.status === 403) {
        lastErr = new HttpError(`HTTP ${res.status} from ${host}`, { status: res.status, url, blocked: true });
      } else if (res.status >= 500) {
        lastErr = new HttpError(`HTTP ${res.status} from ${host}`, { status: res.status, url });
      } else {
        let body = text;
        if (opts.expect === 'json') {
          try { body = JSON.parse(text); } catch { throw new HttpError(`Non-JSON response from ${url} (status ${res.status})`, { status: res.status, url }); }
        }
        if (!res.ok) throw new HttpError(`HTTP ${res.status} from ${url}`, { status: res.status, url });
        return { status: res.status, headers: res.headers, body, text };
      }
    } catch (e) {
      lastErr = e instanceof HttpError ? e : new HttpError(`${e.name === 'TimeoutError' ? 'Timeout' : e.message} (${url})`, { url });
      if (!(e instanceof HttpError) && e.name !== 'TimeoutError' && /JSON/.test(e.message)) throw e;
    } finally {
      release(host);
    }
    if (lastErr?.blocked && attempt >= 1) break; // don't hammer a site that is blocking us
    attempt++;
    if (attempt <= retries) {
      const backoff = 2000 * 2 ** (attempt - 1) + randomBetween(0, 1000);
      log.warn(`retry ${attempt}/${retries} for ${url} in ${backoff} ms: ${lastErr.message}`);
      await sleep(backoff);
    }
  }
  throw lastErr;
}
