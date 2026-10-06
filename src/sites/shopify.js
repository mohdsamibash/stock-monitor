// Generic Shopify adapter for the OTHERS tab: reads one or more collection feeds
// (/collections/<handle>/products.json, allowed by Shopify's default robots.txt) and turns every
// product variant into a listing. Grey imports are accepted and tagged by region.
import { fetchPolite } from '../lib/http.js';
import { CatalogAdapter, STATUS } from './base.js';

// collections: handles, or null/'*' entries to read the newest 250 products of the whole store (/products.json).
// pages: how many 250-product pages to read per collection (big mixed collections spill onto page 2+).
export function makeShopifyAdapter({ id, name, base, collections, pages = 1 }) {
  class ShopifyAdapter extends CatalogAdapter {
    constructor() { super({ id, name, baseUrl: base, group: 'others' }); }
    async fetchListings() {
      const seen = new Set(); const products = [];
      for (const handle of collections) {
        const path = handle === '*' ? '/products.json?limit=250' : `/collections/${handle}/products.json?limit=250`;
        for (let page = 1; page <= pages; page++) {
          const res = await fetchPolite(`${base}${path}${page > 1 ? `&page=${page}` : ''}`, { expect: 'json' });
          const batch = res.body.products || [];
          for (const p of batch) if (!seen.has(p.id)) { seen.add(p.id); products.push(p); }
          if (batch.length < 250) break; // last page
        }
      }
      const out = [];
      for (const p of products) {
        if (!/iphone\s*18|iphone\s*duo/i.test(p.title)) continue;
        for (const v of p.variants || []) {
          const vt = v.title && v.title !== 'Default Title' ? v.title : '';
          const opts = [v.option1, v.option2, v.option3].filter((o) => o && o !== 'Default Title').join(' ');
          out.push({ title: `${p.title} ${vt}`.trim(), colorHint: opts || null, capacityHint: opts || null,
            status: v.available ? STATUS.IN_STOCK : STATUS.OUT_OF_STOCK, price: v.price,
            url: `${base}/products/${p.handle}${p.variants.length > 1 ? `?variant=${v.id}` : ''}` });
        }
      }
      return { listings: out, source: 'shopify-json' };
    }
  }
  return new ShopifyAdapter();
}
