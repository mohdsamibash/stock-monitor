// Gait (gait.com.kw) - Magento 2 (Hyvä theme). One GraphQL request returns every child SKU of the
// configurable parents (iPhone 18 Pro + Pro Max share one parent; iPhone Duo has its own),
// each with stock_status and final price. Fallback: Playwright loads the product page and
// parses the configurable-product JSON Magento embeds in the HTML (window.gaitConfigJson[...]).
import selectors from '../../config/selectors.js';
import { fetchPolite } from '../lib/http.js';
import { withPage } from '../lib/browser.js';
import { ENV } from '../lib/env.js';
import { CatalogAdapter, STATUS } from './base.js';

const cfg = selectors.gait;

const QUERY = `query StockMonitor($keys: [String!]) {
  products(filter: { url_key: { in: $keys } }, pageSize: 20) {
    items {
      name sku url_key stock_status __typename
      price_range { minimum_price { final_price { value currency } } }
      ... on ConfigurableProduct {
        configurable_options { attribute_code label values { value_index label } }
        variants {
          product { sku name stock_status price_range { minimum_price { final_price { value currency } } } }
          attributes { code label value_index }
        }
      }
    }
  }
}`;

class GaitAdapter extends CatalogAdapter {
  constructor() { super({ id: 'gait', name: 'Gait', baseUrl: 'https://gait.com.kw' }); }

  async fetchListings() {
    const keys = [...new Set(Object.values(cfg.urlKeys))];
    try {
      const res = await fetchPolite(cfg.graphql, {
        method: 'POST', expect: 'json',
        headers: { 'content-type': 'application/json', store: cfg.storeCode },
        body: JSON.stringify({ query: QUERY, variables: { keys } }),
      });
      if (res.body.errors?.length) throw new Error('GraphQL error: ' + res.body.errors.map((e) => e.message).join('; '));
      const items = res.body.data?.products?.items || [];
      const listings = this.parseGraphql(items);
      const source = cfg.allocationCheck && ENV.GAIT_ALLOCATION_CHECK ? await this.applyAllocation(listings, items) : 'graphql';
      return { listings, source };
    } catch (e) {
      if (e.blocked || e.robots || ENV.DISABLE_BROWSER_FALLBACK) throw e;
      this.log.warn(`GraphQL failed (${e.message}); trying DOM fallback`);
      return { listings: await this.domFallback(keys), source: 'dom-fallback' };
    }
  }

  parseGraphql(items) {
    const out = [];
    for (const item of items) {
      const baseUrl = cfg.productUrl(item.url_key);
      if (!item.variants) {
        const url = baseUrl;
        out.push({ title: item.name, status: mapStatus(item.stock_status), price: item.price_range?.minimum_price?.final_price?.value, url });
        continue;
      }
      for (const v of item.variants) {
        const attrs = Object.fromEntries((v.attributes || []).map((a) => [a.code, a.label]));
        const modelHint = attrs[cfg.attributes.model] || item.name;
        // Deep link: Gait's Hyvä page preselects swatches from ?attribute_code=option_id (model first).
        const ids = Object.fromEntries((v.attributes || []).map((a) => [a.code, a.value_index]));
        const order = [cfg.attributes.model, cfg.attributes.color, cfg.attributes.capacity].filter((code) => ids[code] != null);
        const url = order.length ? `${baseUrl}?${order.map((code) => `${code}=${ids[code]}`).join('&')}` : baseUrl;
        out.push({
          title: `${modelHint} ${attrs[cfg.attributes.color] || ''} ${attrs[cfg.attributes.capacity] || ''} (${v.product.sku})`,
          modelHint, colorHint: attrs[cfg.attributes.color], capacityHint: attrs[cfg.attributes.capacity],
          status: mapStatus(v.product.stock_status),
          price: v.product.price_range?.minimum_price?.final_price?.value,
          url, parentSku: item.sku, childSku: v.product.sku,
        });
      }
    }
    return out;
  }

  /**
   * Gait runs pre-orders through an allocation system that is separate from Magento stock:
   * GET /preorder/availability/index/?sku=<parent>[&child_id=<child>|sku=<child sku>] returns
   * { state: 'live'|'upcoming'|'native', available: n|null, start_epoch, end_epoch }.
   * The buy button reads `available`: 0 during a live window renders as "Coming Soon" even when
   * stock_status is IN_STOCK. One parent request tells us the window state; only when it is
   * live do we ask once per IN_STOCK child (OUT_OF_STOCK children are blocked either way).
   */
  async applyAllocation(listings, items) {
    let extra = 0;
    for (const item of items) {
      if (!item.variants) continue;
      let parent;
      try { parent = (await fetchPolite(cfg.availabilityUrl(item.sku), { expect: 'json', ignoreRobots: true })).body; extra++; }
      catch (e) { this.log.warn(`allocation endpoint failed for ${item.sku} (${e.message}); using stock_status only`); continue; }
      const mine = listings.filter((l) => l.parentSku === item.sku);
      if (parent.state === 'upcoming') {
        const opens = parent.start_epoch ? new Date(parent.start_epoch * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kuwait' }) : null;
        for (const l of mine) { l.status = STATUS.NOT_LISTED; l.note = opens ? `Pre-orders open ${opens}` : 'Coming soon'; }
        continue;
      }
      if (parent.state !== 'live') continue; // native: stock_status is the truth
      for (const l of mine) {
        if (l.status !== STATUS.IN_STOCK) {
          // Gait labels every unavailable variant "Coming Soon" during a live window, whatever the reason.
          if (l.status === STATUS.OUT_OF_STOCK) { l.note = 'Coming soon'; l.reason = 'Magento reports no stock for this SKU'; }
          continue;
        }
        try {
          const d = (await fetchPolite(cfg.availabilityUrl(l.childSku), { expect: 'json', ignoreRobots: true })).body; extra++;
          if (d.available === 0) { l.status = STATUS.OUT_OF_STOCK; l.note = 'Coming soon'; l.reason = 'Stock exists but the pre-order allocation is exhausted (0 left)'; }
          else if (d.available == null) { l.note = 'Pre-order (allocation unknown)'; }
          else { l.note = 'Pre-order'; l.reason = `${d.available} left in the pre-order allocation`; }
        } catch (e) { this.log.warn(`allocation check failed for ${l.childSku}: ${e.message}`); l.note = 'Pre-order (allocation unknown)'; }
      }
    }
    this.log.info(`allocation check: ${extra} extra request(s)`);
    return 'graphql+allocation';
  }

  // Loads each parent product page and parses the embedded configurable-product JSON
  // ({ attributes, index, salable, optionPrices, sku }).
  async domFallback(keys) {
    const listings = [];
    for (const key of keys) {
      const url = cfg.productUrl(key);
      const html = await withPage(async (page) => {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        return page.content();
      });
      const jc = extractConfigJson(html, cfg.dom.configAnchors);
      if (!jc) { this.log.warn(`no configurable-product JSON found on ${url}`); continue; }
      const title = (html.match(/<title>([^<|]+)/) || [])[1]?.trim() || key;
      const attrs = Object.values(jc.attributes || {});
      const byCode = Object.fromEntries(attrs.map((a) => [a.code, a]));
      const colorAttr = byCode[cfg.attributes.color], capAttr = byCode[cfg.attributes.capacity], modelAttr = byCode[cfg.attributes.model];
      const salable = jc.salable; // { attrId: { optionId: [productIds] } } (MSI-driven)
      const skuMap = jc.sku || {};
      for (const [pid, optionMap] of Object.entries(jc.index || {})) {
        const label = (attr) => attr && attr.options.find((o) => String(o.id) === String(optionMap[attr.id]))?.label;
        const color = label(colorAttr), capacity = label(capAttr), model = label(modelAttr) || title;
        let status;
        if (salable) {
          const ok = Object.entries(optionMap).every(([attrId, optId]) => (salable[attrId]?.[optId] || []).map(String).includes(String(pid)));
          status = ok ? STATUS.IN_STOCK : STATUS.OUT_OF_STOCK;
        } else {
          // Without a salable map Magento only lists purchasable children in `index`.
          status = STATUS.IN_STOCK;
        }
        listings.push({ title: `${model} ${color || ''} ${capacity || ''} (${skuMap[pid] || pid})`, modelHint: model, colorHint: color, capacityHint: capacity, status, price: jc.optionPrices?.[pid]?.finalPrice?.amount, url });
      }
    }
    return listings;
  }
}

// Scans the HTML for any of the anchor strings (e.g. `window.gaitConfigJson[` or `"jsonConfig":`)
// and returns the first balanced JSON object after it that has `index` + `attributes`.
export function extractConfigJson(html, anchors) {
  for (const anchor of anchors) {
    let from = 0;
    while (true) {
      const at = html.indexOf(anchor, from);
      if (at === -1) break;
      from = at + anchor.length;
      const start = html.indexOf('{', from);
      if (start === -1) break;
      let depth = 0, inStr = false, esc = false;
      for (let i = start; i < html.length; i++) {
        const ch = html[i];
        if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
        if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            try { const obj = JSON.parse(html.slice(start, i + 1)); if (obj.index && obj.attributes) return obj; } catch { /* not it */ }
            break;
          }
        }
      }
    }
  }
  return null;
}

function mapStatus(s) {
  if (s === 'IN_STOCK') return STATUS.IN_STOCK;
  if (s === 'OUT_OF_STOCK') return STATUS.OUT_OF_STOCK;
  return STATUS.NOT_LISTED;
}

export default new GaitAdapter();
