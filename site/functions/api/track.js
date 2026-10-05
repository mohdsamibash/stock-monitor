// Cloudflare Pages Function: /api/track — anonymous usage events from mohdbash.com (home + /iphone18) for the owner's dashboard at /dashboard.
// No cookies and no IP addresses are stored: a visitor is a hash of (Kuwait day, IP, user agent), so the ID changes every day.
// Needs the D1 binding ANALYTICS_DB (see wrangler.toml).
const TYPES = new Set(['view', 'tab', 'filter', 'click', 'refresh']);
const PAGES = new Set(['home', 'iphone18']); // home only sends 'view'
const BOT = /bot|crawl|spider|slurp|headless|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|node-fetch|axios|lighthouse|pingdom|uptime/i;
const ORIGIN = /^https:\/\/((www\.)?mohdbash\.com|[a-z0-9-]+\.mohdbashweb\.pages\.dev)$/;
const MAX_EVENTS_PER_VISITOR_DAY = 300;

const kuwaitDay = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);
async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 10).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function source(ref) {
  let host = '';
  try { host = new URL(ref).hostname.replace(/^www\./, '').toLowerCase(); } catch { return 'Direct'; }
  if (!host || /(^|\.)mohdbash\.com$|mohdbashweb\.pages\.dev$/.test(host)) return 'Direct';
  const known = [[/whatsapp|wa\.me/, 'WhatsApp'], [/instagram/, 'Instagram'], [/facebook|fb\.com|fb\.me/, 'Facebook'], [/^t\.co$|twitter|^x\.com$/, 'X'],
    [/^t\.me$|telegram/, 'Telegram'], [/snapchat/, 'Snapchat'], [/tiktok/, 'TikTok'], [/linkedin|lnkd\.in/, 'LinkedIn'], [/reddit/, 'Reddit'],
    [/google\./, 'Google'], [/bing\.com/, 'Bing'], [/duckduckgo/, 'DuckDuckGo'], [/yahoo/, 'Yahoo']];
  for (const [re, name] of known) if (re.test(host)) return name;
  return host.slice(0, 40);
}

export async function onRequestPost({ request, env }) {
  const done = new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  if (!env.ANALYTICS_DB) return done;
  const origin = request.headers.get('origin');
  if (origin && !ORIGIN.test(origin)) return done;
  const ua = request.headers.get('user-agent') || '';
  if (!ua || BOT.test(ua)) return done;
  let body;
  try { body = JSON.parse((await request.text()).slice(0, 2000)); } catch { return done; }
  if (!body || !TYPES.has(body.type)) return done;
  const page = PAGES.has(body.page) ? body.page : 'iphone18';
  if (page === 'home' && body.type !== 'view') return done;

  const now = Date.now();
  const day = kuwaitDay(now);
  const vid = await sha(`${day}|${request.headers.get('cf-connecting-ip') || ''}|${ua}|${env.ANALYTICS_SALT || 'iphone18-kw'}`);
  const db = env.ANALYTICS_DB;
  const seen = await db.prepare('SELECT COUNT(*) AS n FROM events WHERE vid = ? AND day = ?').bind(vid, day).first();
  if ((seen?.n || 0) >= MAX_EVENTS_PER_VISITOR_DAY) return done; // flood guard

  const value = typeof body.value === 'string' ? body.value.replace(/[^\w-]/g, '').slice(0, 40) : '';
  const device = /iPad|Tablet/i.test(ua) ? 'Tablet' : /Mobi|iPhone|Android/i.test(ua) ? 'Phone' : 'Desktop';
  const country = String(request.cf?.country || '').slice(0, 2);
  const ref = body.type === 'view' ? source(typeof body.ref === 'string' ? body.ref : '') : '';
  await db.prepare('INSERT INTO events (ts, day, vid, type, value, country, device, ref, page) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(now, day, vid, body.type, value, country, device, ref, page).run();
  return done;
}
