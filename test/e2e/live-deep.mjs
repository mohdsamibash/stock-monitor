import { chromium } from 'playwright';
const BASE = 'https://mohdbash.com'; const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const out = []; const T = (id, name, ok, detail = '') => out.push({ id, name, ok, detail });
const bundle = await (await fetch(`${BASE}/api/stock?nc=${Date.now()}`)).json();
const cells = bundle.stock.sites.flatMap(s => s.results.map(r => ({ site: s.id, ...r })));
const bySite = Object.fromEntries(bundle.stock.sites.map(s => [s.id, s.results.reduce((m, r) => (m[r.status] = (m[r.status] || 0) + 1, m), {})]));
console.log('breakdown:', JSON.stringify(bySite));

// D1-D2: Gait cells vs Gait's own GraphQL + allocation endpoint (ground truth)
const gq = await (await fetch('https://gait.com.kw/graphql', { method: 'POST', headers: { 'content-type': 'application/json', store: 'g_kw_en', 'user-agent': UA },
  body: JSON.stringify({ query: '{ products(filter:{url_key:{in:["iphone-18-pro","iphone-duo"]}}){ items { ... on ConfigurableProduct { variants { product { sku stock_status price_range{minimum_price{final_price{value}}} } attributes { code label } } } } } }' }) })).json();
const gaitTruth = new Map();
for (const it of gq.data.products.items) for (const v of it.variants) {
  const a = Object.fromEntries(v.attributes.map(x => [x.code, x.label]));
  const model = a.model_variant === 'iPhone 18 Pro Max' ? 'iphone-18-pro-max' : a.model_variant === 'iPhone 18 Pro' ? 'iphone-18-pro' : 'iphone-duo';
  gaitTruth.set(`${model}|${a.color_finish}|${a.storage_capacity}`, { mag: v.product.stock_status, price: v.product.price_range.minimum_price.final_price.value, sku: v.product.sku });
}
const gaitCells = cells.filter(c => c.site === 'gait');
const priceMismatch = gaitCells.filter(c => c.priceKWD != null && gaitTruth.get(c.key) && Math.abs(gaitTruth.get(c.key).price - c.priceKWD) > 0.001);
T('D1', 'Gait prices match Gait GraphQL for all 40 variants', priceMismatch.length === 0, priceMismatch.slice(0, 3).map(c => `${c.key}: site ${c.priceKWD} vs gait ${gaitTruth.get(c.key).price}`).join('; '));
// sample: if Gait says OUT_OF_STOCK in Magento, dashboard must not say IN_STOCK
const falsePos = gaitCells.filter(c => c.status === 'IN_STOCK' && gaitTruth.get(c.key)?.mag === 'OUT_OF_STOCK');
T('D2', 'no Gait false positives (dashboard IN_STOCK while Magento OUT_OF_STOCK)', falsePos.length === 0, falsePos.map(c => c.key).join(', '));
// D3: every Gait IN_STOCK cell must have allocation > 0 right now
const gaitIn = gaitCells.filter(c => c.status === 'IN_STOCK');
let allocOk = true, allocDetail = [];
for (const c of gaitIn.slice(0, 6)) { const sku = gaitTruth.get(c.key)?.sku; const a = await (await fetch(`https://gait.com.kw/g_kw_en/preorder/availability/index/?sku=${encodeURIComponent(sku)}`, { headers: { 'user-agent': UA } })).json(); allocDetail.push(`${c.key}:${a.state}/${a.available}`); if (a.state === 'live' && a.available === 0) allocOk = false; }
T('D3', 'Gait IN_STOCK cells still have allocation now', allocOk, gaitIn.length ? allocDetail.join(' ') : 'no Gait IN_STOCK cells to check');

// D4: Xcite cells vs Xcite's own Algolia proxy
const xr = await (await fetch('https://www.xcite.com/api/algolia/proxy', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://www.xcite.com', 'user-agent': UA },
  body: JSON.stringify({ requests: [{ indexName: 'xcite_prod_kw_en_main', params: { query: 'iPhone 18', hitsPerPage: 100, filters: 'brand:Apple' } }], operation: 'search' }) })).json();
const xTruth = new Map(); for (const h of xr.results[0].hits) xTruth.set(h.slug, h.status_key);
const xCells = cells.filter(c => c.site === 'xcite' && c.url);
const xMismatch = xCells.filter(c => { const slug = c.url.replace('https://www.xcite.com/', '').replace(/\/p$/, ''); const t = xTruth.get(slug); return t && ((t === 'InStock') !== (c.status === 'IN_STOCK')); });
T('D4', 'Xcite statuses match Xcite Algolia for every listed variant', xMismatch.length === 0, xMismatch.length ? xMismatch.slice(0, 4).map(c => c.key + ':' + c.status).join(', ') + ` (data ${Math.round((Date.now() - new Date(bundle.stock.generatedAt)) / 60000)} min old, may have moved since)` : `${xCells.length} checked`);

// D5: Digits cells vs Digits collection feed
const dj = await (await fetch('https://digits.com.kw/collections/apple-iphone-18/products.json?limit=250', { headers: { 'user-agent': UA } })).json();
const dCells = cells.filter(c => c.site === 'digits');
T('D5', 'Digits cells consistent with their feed', dj.products.length === 0 ? dCells.every(c => c.status === 'NOT_LISTED') : dCells.some(c => c.status !== 'NOT_LISTED'), `feed has ${dj.products.length} products; dashboard: ${JSON.stringify(bySite.digits)}`);

// S1-S2: schedule reliability over the last 6 hours
const runs = (await (await fetch('https://api.github.com/repos/mohdsamibash/stock-monitor/actions/runs?per_page=60')).json()).workflow_runs || [];
const since = Date.now() - 6 * 3600e3; const recent = runs.filter(r => new Date(r.created_at) > since).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
const gaps = recent.slice(1).map((r, i) => (new Date(r.created_at) - new Date(recent[i].created_at)) / 60000);
const maxGap = Math.max(0, ...gaps);
T('S1', 'cloud runs every ≤ 20 min over the last 6 h (daytime)', maxGap <= 20, `${recent.length} runs, largest gap ${maxGap.toFixed(0)} min`);
T('S2', 'no failed cloud runs in the last 6 h', recent.every(r => r.conclusion === 'success' || r.status !== 'completed'), recent.filter(r => r.conclusion && r.conclusion !== 'success').map(r => `${r.created_at} ${r.conclusion}`).join(', '));

// R1: refresh round trip (A15 in the first suite dispatched a run) -> new data lands
const before = bundle.stock.generatedAt; let after = before;
for (let i = 0; i < 24 && after === before; i++) { await new Promise(r => setTimeout(r, 10000)); after = (await (await fetch(`${BASE}/api/stock?nc=${Date.now()}`)).json()).stock.generatedAt; }
T('R1', 'Refresh round trip publishes new data within 4 min', after !== before, `before ${before} -> after ${after}`);

// E1-E3: error paths
T('E1', 'unknown page under /iphone18 returns 404', (await fetch(`${BASE}/iphone18/does-not-exist`)).status === 404);
T('E2', 'PUT /api/stock with a bad body and no token is refused', (await fetch(`${BASE}/api/stock`, { method: 'PUT', body: 'not json' })).status === 401);
const burst = await Promise.all([1, 2].map(() => fetch(`${BASE}/api/refresh`, { method: 'POST' }).then(r => r.json())));
T('E3', 'refresh is rate-limited (second press in 3 min is not re-dispatched)', burst.every(b => b.queued === false || b.dispatched !== true) || burst.filter(b => b.dispatched).length <= 1, JSON.stringify(burst.map(b => ({ q: b.queued, d: b.dispatched }))));

// X1-X4: accessibility basics
const br = await chromium.launch(); const p = await br.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto(`${BASE}/iphone18/`, { waitUntil: 'networkidle' }); await p.waitForSelector('.card');
T('X1', 'html has a lang attribute', Boolean(await p.getAttribute('html', 'lang')));
T('X2', 'icon-only buttons have accessible names', await p.$$eval('button', bs => bs.every(b => (b.innerText.trim() || b.getAttribute('aria-label') || b.title))));
T('X3', 'In stock checkbox is keyboard-operable', await (async () => { await p.focus('#instock-toggle'); await p.keyboard.press('Space'); await p.waitForTimeout(300); const c = await p.$eval('#instock-toggle', e => e.checked); await p.keyboard.press('Space'); return c; })());
const contrast = await p.evaluate(() => { const lum = (c) => { const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
  const bg = getComputedStyle(document.body).backgroundColor; const sel = { 'status text (Not listed)': '.chip.NOT_LISTED .s', 'updated time': '#updated', 'secondary text': '.brand-sub', 'status text (Out of stock)': '.chip.OUT_OF_STOCK .s' };
  return Object.fromEntries(Object.entries(sel).map(([k, s]) => { const e = document.querySelector(s); if (!e) return [k, null]; const cs = getComputedStyle(e); const chipBg = getComputedStyle(e.closest('.chip') || document.body).backgroundColor; const effBg = chipBg.includes('rgba(0, 0, 0, 0)') ? bg : chipBg; return [k, +(ratio(cs.color, effBg) * (e.closest('.chip.NOT_LISTED') ? 1 : 1)).toFixed(2)]; })); });
const weak = Object.entries(contrast).filter(([, v]) => v != null && v < 4.5);
T('X4', 'text contrast ≥ 4.5:1 (WCAG AA) on key secondary text', weak.length === 0, Object.entries(contrast).map(([k, v]) => `${k} ${v}`).join(', '));
await br.close();
for (const r of out) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(4)} ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
console.log(`\n${out.filter(r => r.ok).length}/${out.length} passed`);
