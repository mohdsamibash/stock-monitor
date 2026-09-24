import { chromium } from 'playwright';
const BASE = 'https://mohdbash.com'; const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const bundle = await (await fetch(`${BASE}/api/stock?nc=${Date.now()}`)).json();
const cells = bundle.stock.sites.flatMap(s => s.results.map(r => ({ site: s.id, ...r })));
const br = await chromium.launch();

// F1: Gait IN_STOCK cells — what does the real product page button say?
console.log('== F1 Gait IN_STOCK cells, rendered page CTA');
for (const c of cells.filter(x => x.site === 'gait' && x.status === 'IN_STOCK')) {
  const p = await br.newPage({ userAgent: UA }); await p.goto(c.url, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  const cta = await p.$$eval('.pdp-cta-stack button, .pdp-sticky button, #product-addtocart-button', b => [...new Set(b.map(x => `${x.innerText.trim()}${x.disabled ? ' (disabled)' : ''}`).filter(Boolean))]);
  console.log(`  ${c.key} ${c.priceKWD} -> title "${(await p.title()).split('|')[0].trim()}" CTA ${JSON.stringify(cta)}`); await p.close();
}
// F2: Digits — feed variants vs dashboard cells
const dj = await (await fetch('https://digits.com.kw/collections/apple-iphone-18/products.json?limit=250', { headers: { 'user-agent': UA } })).json();
const feed = dj.products.flatMap(p => p.variants.map(v => ({ title: p.title, v: v.title, available: v.available, price: v.price })));
const dCells = cells.filter(c => c.site === 'digits');
console.log(`== F2 Digits feed: ${dj.products.length} products / ${feed.length} variants (${feed.filter(f => f.available).length} available); dashboard: ${dCells.filter(c => c.status === 'IN_STOCK').length} in, ${dCells.filter(c => c.status === 'OUT_OF_STOCK').length} out, ${dCells.filter(c => c.status === 'NOT_LISTED').length} not listed`);
for (const f of feed.slice(0, 4)) console.log(`  feed: ${f.title} / ${f.v} avail=${f.available} ${f.price}`);

// F3: correct contrast (alpha compositing + element opacity)
const p = await br.newPage({ viewport: { width: 1280, height: 900 } }); await p.goto(`${BASE}/iphone18/`, { waitUntil: 'networkidle' }); await p.waitForSelector('.card');
const contrast = await p.evaluate(() => {
  const parse = c => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const bgOf = (el) => { const chain = []; for (let e = el; e; e = e.parentElement) chain.push(e); let col = { r: 255, g: 255, b: 255, a: 1 }; for (const e of chain.reverse()) { const b = parse(getComputedStyle(e).backgroundColor); if (b.a > 0) col = over(b, col); } return col; };
  const opacityOf = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= +getComputedStyle(e).opacity; return o; };
  const L = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
  const sel = { 'Out of stock status': '.chip.OUT_OF_STOCK .s', 'Not listed status': '.chip.NOT_LISTED .s', 'Not listed retailer name': '.chip.NOT_LISTED .r', 'Updated time': '#updated', 'Card counts (0/12 in stock)': '.card-head .n', 'Release date': '.model-head .sub', 'In stock status': '.chip.IN_STOCK .s' };
  return Object.fromEntries(Object.entries(sel).map(([k, s]) => { const e = document.querySelector(s); if (!e) return [k, null]; const bg = bgOf(e); const fg = over({ ...parse(getComputedStyle(e).color), a: parse(getComputedStyle(e).color).a * opacityOf(e) }, bg); return [k, +ratio(fg, bg).toFixed(2)]; }));
});
console.log('== F3 contrast (AA needs 4.5 for body text):'); for (const [k, v] of Object.entries(contrast)) console.log(`  ${v >= 4.5 ? 'ok  ' : 'LOW '} ${k}: ${v}`);
await br.close();

// F4: refresh round trip done properly — trigger, then wait for new data
const before = (await (await fetch(`${BASE}/api/stock?nc=${Date.now()}`)).json()).stock.generatedAt;
const post = await (await fetch(`${BASE}/api/refresh`, { method: 'POST' })).json();
const t0 = Date.now(); let after = before;
while (after === before && Date.now() - t0 < 300000) { await new Promise(r => setTimeout(r, 10000)); after = (await (await fetch(`${BASE}/api/stock?nc=${Date.now()}`)).json()).stock.generatedAt; }
console.log(`== F4 refresh round trip: POST ${JSON.stringify(post)} -> new data ${after !== before ? `after ${Math.round((Date.now() - t0) / 1000)} s` : 'NOT within 5 min'}`);
