// Cloudflare Pages Function: /api/cftraffic — Cloudflare's own traffic numbers for mohdbash.com (last 30 days),
// shown as a "rough totals" card on the private dashboard. Covers the time before our own counter started.
// GET with "Authorization: Bearer <DASHBOARD_PASSWORD>".
// Needs the secret CF_ANALYTICS_TOKEN: a read-only API token with Zone > Zone > Read and Zone > Analytics > Read for mohdbash.com.
const ZONE_NAME = 'mohdbash.com';
const CACHE_SECONDS = 1800; // Cloudflare's daily numbers move slowly; don't hit the API on every dashboard refresh
const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
async function digest(text) { return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))); }
async function same(a, b) { const [x, y] = await Promise.all([digest(a), digest(b)]); let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]; return d === 0; }

async function cf(env, path, init = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init, headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function load(env) {
  const zones = await cf(env, `/zones?name=${ZONE_NAME}`);
  const zoneId = zones.body?.result?.[0]?.id;
  if (!zoneId) return { error: zones.ok ? `Zone ${ZONE_NAME} not visible to this token (add Zone > Zone > Read)` : `Cloudflare said ${zones.status}: ${zones.body?.errors?.[0]?.message || 'token rejected'}` };
  const until = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - 29 * 86400e3).toISOString().slice(0, 10);
  const query = `query($zone: String!, $since: Date!, $until: Date!) { viewer { zones(filter: { zoneTag: $zone }) {
    httpRequests1dGroups(limit: 31, filter: { date_geq: $since, date_leq: $until }, orderBy: [date_ASC]) {
      dimensions { date } sum { requests pageViews countryMap { clientCountryName requests } } uniq { uniques } } } } }`;
  const r = await cf(env, '/graphql', { method: 'POST', body: JSON.stringify({ query, variables: { zone: zoneId, since, until } }) });
  if (r.body?.errors?.length) return { error: `Cloudflare analytics: ${r.body.errors[0].message}` };
  const groups = r.body?.data?.viewer?.zones?.[0]?.httpRequests1dGroups || [];
  const countries = {};
  const days = groups.map((g) => {
    for (const c of g.sum.countryMap || []) countries[c.clientCountryName] = (countries[c.clientCountryName] || 0) + c.requests;
    return { day: g.dimensions.date, requests: g.sum.requests, pageViews: g.sum.pageViews, uniques: g.uniq.uniques };
  });
  const total = (k) => days.reduce((n, d) => n + (d[k] || 0), 0);
  return {
    since, until, days,
    totals: { requests: total('requests'), pageViews: total('pageViews'), uniques: total('uniques') },
    countries: Object.entries(countries).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n).slice(0, 8),
    fetchedAt: new Date().toISOString(),
  };
}

export async function onRequestGet({ request, env, waitUntil }) {
  if (!env.DASHBOARD_PASSWORD) return json({ error: 'The dashboard password has not been set yet.' }, 503);
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!given || !(await same(given, env.DASHBOARD_PASSWORD))) {
    await new Promise((r) => setTimeout(r, 800));
    return json({ error: 'Wrong password' }, 401);
  }
  if (!env.CF_ANALYTICS_TOKEN) return json({ connected: false });

  // Cache the (password-independent) result at the edge under a private key.
  // Unguessable key (derived from the token) so the cached numbers can't be fetched by URL.
  const keyPart = [...(await digest(`cftraffic|${env.CF_ANALYTICS_TOKEN}`))].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
  const cacheKey = new Request(new URL(`/__cftraffic-cache/${keyPart}`, request.url).toString());
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return json({ connected: true, cached: true, ...(await hit.json()) });
  const data = await load(env);
  if (!data.error) waitUntil(cache.put(cacheKey, new Response(JSON.stringify(data), { headers: { 'cache-control': `max-age=${CACHE_SECONDS}` } })));
  return json({ connected: true, ...data });
}
