// OTHERS tab shops (non-official resellers, grey imports allowed). Recon 2026-10-05: every feed below
// answered a plain request and is allowed by the shop's robots.txt. Left out on purpose:
// Alpha Store + Mufaddal (anti-bot challenge), Taw9eel (no iPhone 18), Ooredoo (API behind login redirect).
import { fetchPolite } from '../lib/http.js';
import { CatalogAdapter, STATUS } from './base.js';
import { makeShopifyAdapter } from './shopify.js';

export const mobile2000 = makeShopifyAdapter({ id: 'mobile2000', name: 'Mobile 2000', base: 'https://mobile2000.com', collections: ['iphone-18-series'] });
export const wibi = makeShopifyAdapter({ id: 'wibi', name: 'Wibi', base: 'https://wibi.com.kw', collections: ['apple-iphone-18-series'] });
export const soooq = makeShopifyAdapter({ id: 'soooq', name: 'Soooq', base: 'https://soooq.com', collections: ['iphone-18-series'] });
// Web Store sells new grey imports and used phones; 'used'/'refurbished' listings are rejected by the matcher.
export const webstore = makeShopifyAdapter({ id: 'webstore', name: 'Web Store', base: 'https://webstoreshops.com', collections: ['*'] });
export const store990 = makeShopifyAdapter({ id: 'store990', name: '990 Store', base: 'https://990store.com', collections: ['apple'] });

// Eureka: catalogue search runs on Algolia with a public search-only key embedded in their pages.
class Eureka extends CatalogAdapter {
  constructor() { super({ id: 'eureka', name: 'Eureka', baseUrl: 'https://www.eureka.com.kw', group: 'others' }); }
  async fetchListings() {
    const app = '5GPHMAA239', key = '3d7dbc330852592da244c87ae924a221';
    const res = await fetchPolite(`https://${app}-dsn.algolia.net/1/indexes/*/queries`, {
      method: 'POST', expect: 'json', headers: { 'content-type': 'application/json', 'x-algolia-application-id': app, 'x-algolia-api-key': key },
      body: JSON.stringify({ requests: ['iphone 18', 'iphone duo'].map((query) => ({ indexName: 'instant_records', params: new URLSearchParams({ query, hitsPerPage: '100', filters: 'bn:iphone' }).toString() })) }),
    });
    const seen = new Set(); const out = [];
    for (const r of res.body.results || []) for (const h of r.hits || []) {
      if (seen.has(h.objectID) || !String(h.cn || '').startsWith('Phones > Mobile Phones')) continue;
      seen.add(h.objectID); const qty = Number(h.avaqt);
      out.push({ title: h.itmn, status: qty > 0 ? STATUS.IN_STOCK : STATUS.OUT_OF_STOCK, price: h.clprc, qty: qty > 0 ? qty : null, url: `https://www.eureka.com.kw/products/details/${h.objectID}` });
    }
    return { listings: out, source: 'algolia' };
  }
}

// Best Al-Yousifi: SAP Commerce OCC product search (mrflex.best.com.kw robots.txt allows /occ).
class Best extends CatalogAdapter {
  constructor() { super({ id: 'best', name: 'Best', baseUrl: 'https://best.com.kw', group: 'others' }); }
  async fetchListings() {
    const res = await fetchPolite('https://mrflex.best.com.kw/occ/v2/best/products/search?query=iphone%2018&pageSize=100&fields=FULL&lang=en&curr=KWD', { expect: 'json' });
    const out = [];
    for (const p of res.body.products || []) {
      if (!/iphone\s*18|iphone\s*duo/i.test(p.name)) continue;
      const s = p.stock?.stockLevelStatus;
      out.push({ title: p.name, status: s === 'inStock' || s === 'lowStock' ? STATUS.IN_STOCK : s === 'outOfStock' ? STATUS.OUT_OF_STOCK : STATUS.NOT_LISTED,
        price: p.price?.value, url: `https://best.com.kw/en${p.url}` });
    }
    return { listings: out, source: 'sap-occ' };
  }
}

// Chips: their own REST API (api.chipsorders.com robots.txt allows everything). Gives exact online quantity.
class Chips extends CatalogAdapter {
  constructor() { super({ id: 'chips', name: 'Chips', baseUrl: 'https://chipsorders.com', group: 'others' }); }
  async fetchListings() {
    const out = [];
    for (let page = 1; page <= 3; page++) {
      const res = await fetchPolite(`https://api.chipsorders.com/api/v1/products?search=iphone%2018&per_page=48&page=${page}`, { expect: 'json', headers: { 'accept-language': 'en', country: 'KW' } });
      const items = (res.body.data?.products || []).filter((p) => /iphone\s*18|iphone\s*duo/i.test(p.name));
      for (const p of items) {
        const online = p.inventory?.online || {}; const qty = Number(online.quantity || 0);
        out.push({ title: p.name, status: online.available && qty > 0 ? STATUS.IN_STOCK : STATUS.OUT_OF_STOCK, price: p.pricing?.current_price ?? p.pricing?.price,
          qty: qty > 0 ? qty : null, url: `https://chipsorders.com/kw-en/product/${p.slug}` });
      }
      if (!items.length || !res.body.data?.pagination?.has_more) break; // stop once a page has no iPhone 18 phones
    }
    return { listings: out, source: 'chips-api' };
  }
}

// Talabat Mart: the public iPhone category page embeds its product list (with stockAmount) as JSON.
// Stock is for the branch the website serves by default (Hawally).
class TalabatMart extends CatalogAdapter {
  constructor() { super({ id: 'talabat', name: 'Talabat Mart', baseUrl: 'https://www.talabat.com', group: 'others' }); }
  async fetchListings() {
    const res = await fetchPolite('https://www.talabat.com/kuwait/talabat-mart/apple/iphone');
    const m = res.text.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) throw new Error('Talabat page has no __NEXT_DATA__');
    const items = []; const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if ('stockAmount' in o && 'title' in o) items.push(o); Object.values(o).forEach(walk); } };
    walk(JSON.parse(m[1]));
    const seen = new Set(); const out = [];
    for (const p of items) {
      if (seen.has(p.sku || p.title) || !/iphone\s*18|iphone\s*duo/i.test(p.title)) continue; seen.add(p.sku || p.title);
      const qty = Number(p.stockAmount || 0);
      out.push({ title: p.title, status: qty > 0 ? STATUS.IN_STOCK : STATUS.OUT_OF_STOCK, price: p.price, qty: qty > 0 ? qty : null, url: `https://www.talabat.com${p.url}` });
    }
    return { listings: out, source: 'next-data' };
  }
}

export const eureka = new Eureka();
export const best = new Best();
export const chips = new Chips();
export const talabat = new TalabatMart();
