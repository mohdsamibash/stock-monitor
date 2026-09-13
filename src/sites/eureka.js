// Eureka (eureka.com.kw) - custom ASP.NET/AngularJS storefront whose catalogue search runs on
// Algolia with a public search-only key embedded in the page. One multi-query request against
// Algolia (brand facet "iphone") returns name, available quantity and price for every iPhone.
// The product page itself is Angular-rendered from /list/getsngitmdet?id=, so there is no
// meaningful DOM fallback: if Algolia is unreachable the retailer is reported as ERROR.
import selectors from '../../config/selectors.js';
import { fetchPolite } from '../lib/http.js';
import { CatalogAdapter, STATUS } from './base.js';

const cfg = selectors.eureka;

class EurekaAdapter extends CatalogAdapter {
  constructor() { super({ id: 'eureka', name: 'Eureka', baseUrl: 'https://www.eureka.com.kw' }); }

  async fetchListings() {
    const { appId, searchKey, index } = cfg.algolia;
    const url = `https://${appId}-dsn.algolia.net/1/indexes/*/queries`;
    const requests = ['iphone 18', 'iphone duo'].map((query) => ({ indexName: index, params: new URLSearchParams({ query, hitsPerPage: String(cfg.hitsPerPage), filters: cfg.brandFilter }).toString() }));
    const res = await fetchPolite(url, {
      method: 'POST', expect: 'json',
      headers: { 'content-type': 'application/json', 'x-algolia-application-id': appId, 'x-algolia-api-key': searchKey },
      body: JSON.stringify({ requests }),
    });
    const results = res.body?.results;
    if (!Array.isArray(results)) throw new Error('unexpected Algolia response: ' + JSON.stringify(res.body).slice(0, 200));
    const seen = new Set(); const hits = [];
    for (const r of results) for (const h of r.hits || []) if (!seen.has(h.objectID)) { seen.add(h.objectID); hits.push(h); }
    return { listings: this.parseHits(hits), source: 'algolia' };
  }

  parseHits(hits) {
    const f = cfg.fields;
    const out = [];
    for (const h of hits) {
      if (!String(h[f.category] || '').startsWith(cfg.phoneCategoryPrefix)) continue;
      const qty = Number(h[f.qty]);
      out.push({
        title: h[f.name],
        status: Number.isFinite(qty) ? (qty > 0 ? STATUS.IN_STOCK : STATUS.OUT_OF_STOCK) : STATUS.NOT_LISTED,
        price: h[f.price], url: cfg.productUrl(h[f.id]),
      });
    }
    return out;
  }
}

export default new EurekaAdapter();
