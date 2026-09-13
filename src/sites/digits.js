// Digits (digits.com.kw) - Shopify. One request to the collection JSON feed returns every
// iPhone 18 product (Digits lists one product per colour+capacity) with `available` and price.
// If a model has no listings in the configured collections, ONE extra request scans the
// newest 250 products of the whole catalogue. Fallback: Playwright renders the collection page.
import selectors from '../../config/selectors.js';
import { MODELS } from '../../config/variants.js';
import { fetchPolite } from '../lib/http.js';
import { withPage } from '../lib/browser.js';
import { ENV } from '../lib/env.js';
import { matchModel } from '../normalize.js';
import { CatalogAdapter, STATUS } from './base.js';

const cfg = selectors.digits;

class DigitsAdapter extends CatalogAdapter {
  constructor() { super({ id: 'digits', name: 'Digits', baseUrl: 'https://digits.com.kw' }); }

  async fetchListings() {
    try {
      let products = [];
      for (const handle of cfg.collections) {
        const res = await fetchPolite(`${cfg.base}/collections/${handle}/products.json?limit=250`, { expect: 'json' });
        products.push(...(res.body.products || []));
      }
      const modelsSeen = new Set(products.map((p) => matchModel(p.title)).filter(Boolean));
      const missing = MODELS.filter((m) => !modelsSeen.has(m.id));
      if (missing.length && cfg.catalogFallback) {
        this.log.info(`no listings for ${missing.map((m) => m.id).join(', ')} in collections; scanning catalogue feed once`);
        const res = await fetchPolite(cfg.base + cfg.catalogFallback, { expect: 'json' });
        const seen = new Set(products.map((p) => p.id));
        for (const p of res.body.products || []) if (!seen.has(p.id) && matchModel(p.title)) products.push(p);
      }
      return { listings: this.parseProducts(products), source: 'shopify-json' };
    } catch (e) {
      if (e.blocked || e.robots || ENV.DISABLE_BROWSER_FALLBACK) throw e;
      this.log.warn(`Shopify JSON failed (${e.message}); trying DOM fallback`);
      return { listings: await this.domFallback(), source: 'dom-fallback' };
    }
  }

  parseProducts(products) {
    const out = [];
    for (const p of products) {
      const url = cfg.productUrl(p.handle);
      for (const v of p.variants || []) {
        const vt = v.title && v.title !== 'Default Title' ? v.title : '';
        const opts = [v.option1, v.option2, v.option3].filter((o) => o && o !== 'Default Title').join(' ');
        out.push({
          title: `${p.title} ${vt}`.trim(),
          colorHint: opts || null, capacityHint: opts || null,
          status: v.available ? STATUS.IN_STOCK : STATUS.OUT_OF_STOCK,
          price: v.price, url,
        });
      }
    }
    return out;
  }

  async domFallback() {
    const listings = [];
    for (const handle of cfg.collections) {
      const url = `${cfg.base}/collections/${handle}`;
      const cards = await withPage(async (page) => {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        return page.$$eval(cfg.dom.productCard, (els, dom) => els.map((el) => ({
          title: el.querySelector(dom.cardTitle)?.textContent?.trim() || '',
          href: el.querySelector('a[href*="/products/"]')?.getAttribute('href') || null,
          price: el.querySelector(dom.price)?.textContent || null,
          soldOut: Boolean(el.querySelector(dom.soldOutBadge)) || /sold out|out of stock/i.test(el.textContent),
        })), cfg.dom);
      });
      for (const c of cards) if (c.title) listings.push({ title: c.title, status: c.soldOut ? STATUS.OUT_OF_STOCK : STATUS.IN_STOCK, price: c.price, url: c.href ? new URL(c.href, this.baseUrl).href : url });
    }
    return listings;
  }
}

export default new DigitsAdapter();
