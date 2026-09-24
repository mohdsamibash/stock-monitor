import { chromium, devices } from 'playwright';
const BASE = 'https://mohdbash.com';
const results = []; const T = (id, name, ok, detail = '') => { results.push({ id, name, ok, detail }); };
const j = async (u, o) => { const r = await fetch(u, o); let b = null; try { b = await r.json(); } catch {} return { r, b }; };

// ---------- API ----------
{ const { r, b } = await j(`${BASE}/api/stock?nc=${Date.now()}`);
  T('A1', 'GET /api/stock returns 200 JSON', r.ok && b && b.stock, `status ${r.status}`);
  const s = b?.stock; const sites = s?.sites || [];
  T('A2', 'bundle has stock/status/history', Boolean(b?.stock && b?.status && b?.history));
  T('A3', 'exactly 3 retailers (Gait, Xcite, Digits)', sites.map(x => x.id).join(',') === 'gait,xcite,digits', sites.map(x => x.id).join(','));
  T('A4', 'each retailer has 40 variant rows', sites.every(x => x.results.length === 40), sites.map(x => x.results.length).join('/'));
  const ageMin = (Date.now() - new Date(s.generatedAt)) / 60000;
  T('A5', 'data fresher than 20 min (15-min cadence + run time)', ageMin < 20, `${ageMin.toFixed(1)} min old, profile ${b.status.profile.profile}`);
  const statuses = new Set(sites.flatMap(x => x.results.map(y => y.status)));
  T('A6', 'statuses only from the enum', [...statuses].every(v => ['IN_STOCK','OUT_OF_STOCK','NOT_LISTED','ERROR'].includes(v)), [...statuses].join(','));
  const counted = sites.flatMap(x => x.results).filter(y => y.status === 'IN_STOCK').length;
  T('A7', 'summary.inStock matches counted cells', s.summary.inStock === counted && s.summary.total === 120, `${s.summary.inStock}/${s.summary.total} vs counted ${counted}`);
  const badPrice = sites.flatMap(x => x.results).filter(y => y.priceKWD != null && !(y.priceKWD > 100 && y.priceKWD < 2000));
  T('A8', 'all prices in a sane KWD range (100-2000)', badPrice.length === 0, badPrice.slice(0,3).map(y => `${y.key}:${y.priceKWD}`).join(' '));
  const noUrl = sites.flatMap(x => x.results).filter(y => y.status !== 'NOT_LISTED' && y.status !== 'ERROR' && !y.url);
  T('A9', 'every listed cell has a product URL', noUrl.length === 0, `${noUrl.length} missing`);
  T('A10', 'no retailer in error/backoff', sites.every(x => x.status === 'ok'), sites.map(x => `${x.id}:${x.status}`).join(' '));
  const hdr = r.headers; T('A11', 'stock API cache-control + CORS headers', /max-age/.test(hdr.get('cache-control')||'') && hdr.get('access-control-allow-origin') === '*', `${hdr.get('cache-control')} / ${hdr.get('access-control-allow-origin')}`);
}
{ const { r, b } = await j(`${BASE}/api/refresh?nc=${Date.now()}`); T('A12', 'GET /api/refresh reports pending flag', r.ok && typeof b?.pending === 'boolean', JSON.stringify(b)); }
{ const { r, b } = await j(`${BASE}/api/refresh`, { method: 'DELETE', headers: { authorization: 'Bearer wrong' } }); T('A13', 'DELETE /api/refresh rejects a bad token', r.status === 401, `status ${r.status}`); }
{ const { r } = await j(`${BASE}/api/stock`, { method: 'PUT', headers: { authorization: 'Bearer wrong', 'content-type': 'application/json' }, body: '{}' }); T('A14', 'PUT /api/stock rejects a bad token', r.status === 401, `status ${r.status}`); }
{ const { r, b } = await j(`${BASE}/api/refresh`, { method: 'POST' }); T('A15', 'POST /api/refresh queues + dispatches a cloud run', r.ok && b?.pending === true && (b.dispatched === true || b.queued === false), JSON.stringify(b)); }

// ---------- UI ----------
const browser = await chromium.launch();
for (const [label, ctxOpts] of [['desktop', { viewport: { width: 1280, height: 900 } }], ['iPhone', { ...devices['iPhone 15 Pro'] }]]) {
  const ctx = await browser.newContext(ctxOpts); const p = await ctx.newPage();
  const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const failedReq = []; p.on('requestfailed', q => failedReq.push(q.url()));
  const t0 = Date.now(); const resp = await p.goto(`${BASE}/iphone18/`, { waitUntil: 'networkidle' }); const loadMs = Date.now() - t0;
  await p.waitForFunction(() => document.querySelectorAll('.card').length > 0, null, { timeout: 15000 }).catch(() => {});
  T(`U1-${label}`, 'page loads 200 with cards', resp.status() === 200 && (await p.$$('.card')).length === 10, `${(await p.$$('.card')).length} cards, ${loadMs} ms`);
  T(`U2-${label}`, 'no JS/console errors, no failed requests', errors.length === 0 && failedReq.length === 0, [...errors, ...failedReq].slice(0,3).join(' | '));
  T(`U3-${label}`, 'no horizontal overflow', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await p.evaluate(() => `${document.documentElement.scrollWidth}/${window.innerWidth}`));
  T(`U4-${label}`, 'default theme is light', await p.evaluate(() => document.documentElement.dataset.theme) === 'light');
  const counter = await p.$eval('#counter', e => e.innerText.replace(/\s+/g, ' ').trim());
  const apiIn = (await j(`${BASE}/api/stock?nc=${Date.now()}`)).b.stock.summary.inStock;
  T(`U5-${label}`, 'header counter equals API inStock', counter.startsWith(String(apiIn)), `"${counter}" vs API ${apiIn}`);
  T(`U6-${label}`, 'updated-time shown', /Updated \d+/.test(await p.$eval('#updated', e => e.innerText)), await p.$eval('#updated', e => e.innerText));
  const tabs = await p.$$eval('#tabs .tab', t => t.map(x => x.textContent.trim()));
  T(`U7-${label}`, 'four model pills present and all visible', tabs.join(',') === 'All,18 Pro,18 Pro Max,Duo' && await p.$eval('#tabs', e => e.scrollWidth <= e.clientWidth + 1), tabs.join(','));
  T(`U8-${label}`, 'no leftover filter UI', !(await p.$('#filter-open')) && !(await p.$('#sheet')));
  await p.click('text=18 Pro Max'); await p.waitForTimeout(700);
  T(`U9-${label}`, 'tab switch shows only Pro Max', (await p.$$eval('section.model h2', h => h.map(x => x.textContent))).join() === 'iPhone 18 Pro Max');
  await p.click('text=Duo'); await p.waitForTimeout(700);
  T(`U10-${label}`, 'Duo shows Coming soon pill', Boolean(await p.$('section.model.coming .soon')), await p.$eval('section.model .soon', e => e.textContent).catch(() => 'none'));
  await p.click('text=All'); await p.waitForTimeout(700);
  await p.click('label.instock'); await p.waitForTimeout(400);
  const shownChips = await p.$$eval('.chip', c => c.length); const greenOnly = await p.$$eval('.row', r => r.every(row => row.querySelector('.chip.IN_STOCK')));
  T(`U11-${label}`, 'In stock only keeps only rows with a green chip', (await p.$eval('#instock-toggle', e => e.checked)) && (shownChips === 0 || greenOnly), `${shownChips} chips shown`);
  await p.click('label.instock'); await p.waitForTimeout(300);
  const links = await p.$$eval('a.chip', a => a.map(x => ({ href: x.href, target: x.target, rel: x.rel })));
  T(`U12-${label}`, 'retailer chips open in new tab with noopener', links.length > 0 && links.every(l => l.target === '_blank' && /noopener/.test(l.rel)), `${links.length} links`);
  T(`U13-${label}`, 'chip links point to the right retailer domain', links.every(l => /gait\.com\.kw|xcite\.com|digits\.com\.kw/.test(l.href)), links.find(l => !/gait\.com\.kw|xcite\.com|digits\.com\.kw/.test(l.href))?.href || '');
  const best = await p.$$eval('.chip.best', c => c.length); const inStock = await p.$$eval('.chip.IN_STOCK', c => c.length);
  T(`U14-${label}`, 'Best badge only on in-stock chips, at most one per row', best <= inStock && await p.$$eval('.row', r => r.every(row => row.querySelectorAll('.chip.best').length <= 1)), `${best} best / ${inStock} in stock`);
  await p.click('#theme-toggle'); await p.waitForTimeout(400);
  T(`U15-${label}`, 'moon toggles dark theme and persists', await p.evaluate(() => document.documentElement.dataset.theme === 'dark' && localStorage.getItem('theme') === 'dark'));
  await p.click('#theme-toggle');
  T(`U16-${label}`, 'Refresh button visible & enabled', await p.$eval('#refresh', e => !e.hidden && !e.disabled));
  T(`U17-${label}`, 'title + noindex meta present', (await p.title()).includes('iPhone 18') && await p.$eval('meta[name=robots]', m => m.content) === 'noindex');
  T(`U18-${label}`, 'assets version-tagged', await p.$$eval('script[src],link[rel=stylesheet]', els => els.filter(e => /iphone18/.test(e.src || e.href)).every(e => /\?v=[a-f0-9]{8}/.test(e.src || e.href))));
  T(`U19-${label}`, 'page load under 4 s', loadMs < 4000, `${loadMs} ms`);
  await ctx.close();
}
await browser.close();

// ---------- link spot-check: 3 random live product URLs ----------
{ const { b } = await j(`${BASE}/api/stock?nc=${Date.now()}`);
  const urls = b.stock.sites.flatMap(x => x.results).filter(y => y.url && y.status !== 'NOT_LISTED').map(y => y.url);
  const pick = [...new Set(urls)].sort(() => Math.random() - 0.5).slice(0, 3);
  for (const u of pick) { const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0' }, redirect: 'follow' }).catch(() => ({ status: 0 })); T('L1', `product link reachable: ${new URL(u).host}`, r.status === 200, `status ${r.status}`); }
}
const pass = results.filter(r => r.ok).length;
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(12)} ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
console.log(`\n${pass}/${results.length} passed`);
