// Xcite (xcite.com) - Next.js storefront backed by Algolia through a same-origin proxy
// (/api/algolia/proxy). One POST carrying two queries returns every Apple iPhone 18 / Duo
// listing with status_key, price, colour, storage and slug. Fallback: Playwright renders the
// search page and scans product cards.
import selectors from '../../config/selectors.js';
import { fetchPolite } from '../lib/http.js';
import { withPage } from '../lib/browser.js';
import { ENV } from '../lib/env.js';
import { CatalogAdapter, STATUS } from './base.js';

const cfg = selectors.xcite;

class XciteAdapter extends CatalogAdapter {
  constructor() { super({ id: 'xcite', name: 'Xcite', baseUrl: 'https://www.xcite.com' }); }

  async fetchListings() {
    const requests = cfg.queries.map((q) => ({ indexName: cfg.indexName, params: { query: q, hitsPerPage: cfg.hitsPerPage, filters: cfg.brandFilter } }));
    try {
      const res = await fetchPolite(cfg.proxy, {
        method: 'POST', expect: 'json',
        headers: { 'content-type': 'application/json', origin: 'https://www.xcite.com', referer: cfg.searchUrl(cfg.queries[0]) },
        body: JSON.stringify({ requests, operation: 'search' }),
      });
      const results = res.body?.results;
      if (!Array.isArray(results)) throw new Error('unexpected proxy response: ' + JSON.stringify(res.body).slice(0, 200));
      const seen = new Set();
      const hits = [];
      for (const r of results) for (const h of r.hits || []) if (!seen.has(h.objectID)) { seen.add(h.objectID); hits.push(h); }
      return { listings: this.parseHits(hits), source: 'algolia-proxy' };
    } catch (e) {
      if (e.blocked || e.robots || ENV.DISABLE_BROWSER_FALLBACK) throw e;
      this.log.warn(`proxy failed (${e.message}); trying DOM fallback`);
      return { listings: await this.domFallback(), source: 'dom-fallback' };
    }
  }

  parseHits(hits) {
    const f = cfg.fields;
    const out = [];
    for (const h of hits) {
      const isPhone = (h.categoryKeys || []).includes(cfg.phoneCategoryKey) || /^iphone/i.test(h[f.model] || '');
      if (!isPhone) continue;
      let status = STATUS.NOT_LISTED;
      if (h[f.statusKey] === 'InStock' || h[f.inStock] === true) status = STATUS.IN_STOCK;
      else if (h[f.statusKey] === 'OutOfStock' || h[f.inStock] === false) status = STATUS.OUT_OF_STOCK;
      out.push({
        title: h[f.name], colorHint: h[f.color] || null, capacityHint: h[f.capacity] || null, modelHint: h[f.model] || null,
        status, price: h[f.price], url: cfg.productUrl(h[f.slug]),
      });
    }
    return out;
  }

  async domFallback() {
    const listings = [];
    for (const q of cfg.queries) {
      const cards = await withPage(async (page) => {
        await page.goto(cfg.searchUrl(q), { waitUntil: 'networkidle' });
        return page.$$eval(cfg.dom.productCard, (els, dom) => els.map((el) => ({
          title: el.querySelector(dom.cardTitle)?.textContent?.trim() || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 200),
          href: el.getAttribute('href') || el.querySelector('a[href]')?.getAttribute('href') || null,
          price: el.querySelector(dom.cardPrice)?.textContent || null,
          soldOut: Boolean(el.querySelector(dom.cardOutOfStock)) || /out of stock|sold out/i.test(el.textContent),
          addable: /add to cart|pre-?order/i.test(el.textContent),
        })), cfg.dom);
      });
      for (const c of cards) {
        listings.push({ title: c.title, status: c.soldOut ? STATUS.OUT_OF_STOCK : c.addable ? STATUS.IN_STOCK : STATUS.NOT_LISTED, price: c.price, url: c.href ? new URL(c.href, this.baseUrl).href : cfg.searchUrl(q) });
      }
    }
    return listings;
  }
}

export default new XciteAdapter();
