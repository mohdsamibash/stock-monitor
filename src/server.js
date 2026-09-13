// Dashboard server: static files from public/ + a tiny JSON API. `--with-watch` also runs the
// scheduled loop in-process (npm start).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ENV } from './lib/env.js';
import { logger } from './lib/log.js';
import { PUBLIC_DIR, STOCK_FILE, readJson } from './lib/paths.js';
import { runPass } from './runner.js';
import { pickProfile } from './schedule.js';
import { requestsPerHour } from './lib/http.js';
import { readHistory, availabilityWindows } from './history.js';
import { startWatch, parseProfileArg } from './watch.js';
import { activeChannels } from './alerts/index.js';
import { aiAvailable } from './ai/client.js';

const log = logger('server');
const argv = process.argv.slice(2);
const withWatch = argv.includes('--with-watch');
const profileOverride = parseProfileArg(argv);
const watch = withWatch ? startWatch({ profileOverride }) : null;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const MIN_REFRESH_GAP_MS = 60_000;
let lastManualRefresh = 0;
let refreshInFlight = null; // promise of the pass started by /api/refresh
let lastRefreshError = null;

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function statusPayload() {
  const profile = watch?.current || pickProfile(new Date(), profileOverride);
  return { now: new Date().toISOString(), profile, watch: Boolean(watch), nextRunAt: watch?.nextRunAt || null, running: Boolean(refreshInFlight), lastRefreshError, requestsPerHour: requestsPerHour(), alertChannels: activeChannels().map((c) => c.id), alertOn: ENV.ALERT_ON, ai: aiAvailable(), env: { CHECK_INTERVAL_MINUTES: ENV.CHECK_INTERVAL_MINUTES } };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/stock') {
      const stock = readJson(STOCK_FILE, null);
      return json(res, stock ? 200 : 404, stock || { error: 'No stock.json yet. Run `npm run check` first.' });
    }
    if (url.pathname === '/api/status') return json(res, 200, statusPayload());
    if (url.pathname === '/api/history') {
      const hours = Math.min(Number(url.searchParams.get('hours')) || 24, 24 * 14);
      const entries = await readHistory({ sinceMs: Date.now() - hours * 3600_000 });
      return json(res, 200, { hours, runs: entries.length, changes: entries.flatMap((e) => (e.changes || []).map((c) => ({ ts: e.ts, ...c }))).slice(-500), windows: availabilityWindows(entries) });
    }
    if (url.pathname === '/api/refresh' && req.method === 'POST') {
      // A pass can take 1-2 minutes (Gait allocation checks) and Safari drops requests after ~60 s,
      // so start it in the background and let the page poll /api/status until running=false.
      if (refreshInFlight) return json(res, 202, { started: false, running: true });
      if (Date.now() - lastManualRefresh < MIN_REFRESH_GAP_MS) return json(res, 429, { error: `Please wait ${Math.ceil((MIN_REFRESH_GAP_MS - (Date.now() - lastManualRefresh)) / 1000)} s between manual refreshes` });
      lastManualRefresh = Date.now();
      const profile = watch?.current || pickProfile(new Date(), profileOverride);
      lastRefreshError = null;
      refreshInFlight = runPass({ profile, trigger: 'manual' }).catch((e) => { lastRefreshError = e.message; log.error(`manual refresh failed: ${e.message}`); }).finally(() => { refreshInFlight = null; });
      return json(res, 202, { started: true, running: true });
    }
    // static
    let file = url.pathname === '/' ? '/index.html' : url.pathname;
    file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
    const abs = path.join(PUBLIC_DIR, file);
    if (!abs.startsWith(PUBLIC_DIR) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(abs)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(abs).pipe(res);
  } catch (e) {
    log.error(e.stack || e.message);
    json(res, 500, { error: e.message });
  }
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    log.error(`port ${ENV.PORT} is already in use. Another copy of the dashboard is probably running. Stop it (e.g. \`lsof -ti :${ENV.PORT} | xargs kill\`) or set PORT=${ENV.PORT + 1} in .env.`);
    process.exit(1);
  }
  throw e;
});
server.listen(ENV.PORT, () => log.info(`dashboard on http://localhost:${ENV.PORT}${withWatch ? " (watch loop running)" : ""}`));
