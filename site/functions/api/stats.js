// Cloudflare Pages Function: /api/stats — numbers for the private dashboard at mohdbash.com/dashboard.
// GET with "Authorization: Bearer <DASHBOARD_PASSWORD>" (a Pages secret). ?days=1|7|30|90&page=all|home|iphone18
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const kuwaitDay = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);
async function digest(text) { return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))); }
async function same(a, b) { const [x, y] = await Promise.all([digest(a), digest(b)]); let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]; return d === 0; }

export async function onRequestGet({ request, env }) {
  if (!env.DASHBOARD_PASSWORD) return json({ error: 'The dashboard password has not been set yet.' }, 503);
  if (!env.ANALYTICS_DB) return json({ error: 'ANALYTICS_DB binding missing' }, 500);
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!given || !(await same(given, env.DASHBOARD_PASSWORD))) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return json({ error: 'Wrong password' }, 401);
  }
  const params = new URL(request.url).searchParams;
  const days = Math.min(90, Math.max(1, parseInt(params.get('days') || '7', 10) || 7));
  const page = ['home', 'iphone18'].includes(params.get('page')) ? params.get('page') : 'all';
  const P = page === 'all' ? '' : ` AND page = '${page}'`; // whitelisted above
  const now = Date.now();
  const today = kuwaitDay(now);
  const from = kuwaitDay(now - (days - 1) * 86400e3);
  const chartFrom = kuwaitDay(now - (Math.max(days, 7) - 1) * 86400e3);
  const db = env.ANALYTICS_DB;
  const q = (sql, ...args) => db.prepare(sql).bind(...args);
  // A visit (session) starts at a page view with no earlier view by the same visitor in the last 30 minutes.
  const VISIT_GAP = 30 * 60e3;
  const starts = (partition = 'vid', filter = P) =>
    `SELECT * FROM (SELECT day, page, ref, ts, LAG(ts) OVER (PARTITION BY ${partition} ORDER BY ts) AS prev FROM events WHERE type = 'view' AND day >= ?${filter}) WHERE prev IS NULL OR ts - prev > ${VISIT_GAP}`;
  const top = (where, col = 'value', count = 'COUNT(*)', limit = 15) =>
    q(`SELECT ${col} AS k, ${count} AS n FROM events WHERE day >= ?${P} AND ${where} GROUP BY ${col} ORDER BY n DESC LIMIT ${limit}`, from);
  const [summary, todayRow, live, series, devices, countries, sources, tabs, filters, clicks, refresh, first, pages, visits, visitsToday, visitSeries, pageVisits, oses, browsers, langs] = await db.batch([
    q(`SELECT COUNT(DISTINCT vid) AS visitors, SUM(type = 'view') AS views FROM events WHERE day >= ?${P}`, from),
    q(`SELECT COUNT(DISTINCT vid) AS visitors, SUM(type = 'view') AS views FROM events WHERE day = ?${P}`, today),
    q(`SELECT COUNT(DISTINCT vid) AS n FROM events WHERE ts > ?${P}`, now - 5 * 60e3),
    q(`SELECT day, COUNT(DISTINCT vid) AS visitors, SUM(type = 'view') AS views FROM events WHERE day >= ?${P} GROUP BY day ORDER BY day`, chartFrom),
    top("type = 'view'", 'device', 'COUNT(DISTINCT vid)'),
    top("type = 'view' AND country != ''", 'country', 'COUNT(DISTINCT vid)', 12),
    q(`SELECT COALESCE(NULLIF(ref, ''), 'Direct') AS k, COUNT(*) AS n FROM (${starts()}) GROUP BY k ORDER BY n DESC LIMIT 12`, from), // where each visit came from
    top("type IN ('view', 'tab') AND value IN ('official', 'others')"),
    top("type = 'filter' AND value != ''"),
    top("type = 'click' AND value != ''"),
    q(`SELECT COUNT(*) AS n FROM events WHERE day >= ?${P} AND type = 'refresh'`, from),
    q('SELECT MIN(ts) AS ts FROM events'),
    q("SELECT page AS k, COUNT(DISTINCT vid) AS visitors, SUM(type = 'view') AS views FROM events WHERE day >= ? GROUP BY page ORDER BY visitors DESC", from),
    q(`SELECT COUNT(*) AS n FROM (${starts()})`, from),
    q(`SELECT COUNT(*) AS n FROM (${starts()}) WHERE day = ?`, from, today),
    q(`SELECT day, COUNT(*) AS n FROM (${starts()}) GROUP BY day`, chartFrom),
    q(`SELECT page AS k, COUNT(*) AS n FROM (${starts('vid, page', '')}) GROUP BY page`, from),
    top("type = 'view' AND os != ''", 'os', 'COUNT(DISTINCT vid)', 10),
    top("type = 'view' AND browser != ''", 'browser', 'COUNT(DISTINCT vid)', 10),
    top("type = 'view' AND lang != ''", 'lang', 'COUNT(DISTINCT vid)', 8),
  ]);
  const rows = (r) => r.results || [];
  const visitsByDay = Object.fromEntries(rows(visitSeries).map((r) => [r.day, r.n]));
  const visitsByPage = Object.fromEntries(rows(pageVisits).map((r) => [r.k, r.n]));
  return json({
    days, page, from, todayDay: today, generatedAt: new Date(now).toISOString(), countingSince: rows(first)[0]?.ts || null,
    range: { visitors: rows(summary)[0]?.visitors || 0, visits: rows(visits)[0]?.n || 0, views: rows(summary)[0]?.views || 0, refresh: rows(refresh)[0]?.n || 0 },
    today: { visitors: rows(todayRow)[0]?.visitors || 0, visits: rows(visitsToday)[0]?.n || 0, views: rows(todayRow)[0]?.views || 0 },
    liveNow: rows(live)[0]?.n || 0,
    chartFrom, series: rows(series).map((r) => ({ ...r, visits: visitsByDay[r.day] || 0 })),
    devices: rows(devices), countries: rows(countries), sources: rows(sources), oses: rows(oses), browsers: rows(browsers), langs: rows(langs),
    tabs: rows(tabs), filters: rows(filters), clicks: rows(clicks), pages: rows(pages).map((r) => ({ ...r, visits: visitsByPage[r.k] || 0 })),
  });
}
