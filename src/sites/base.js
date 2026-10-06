// Shared helpers for retailer adapters. Every adapter exports:
//   { id, name, baseUrl, discover(), checkModel(model) -> [{ color, capacity, status, priceKWD, url, checkedAt }] }
// discover() performs the (few) network requests for a pass and caches the parsed listings;
// checkModel() is pure filtering over that cache so no extra requests are made per model/variant.
import { STATUS, variantKey } from '../../config/variants.js';
import { classifyListing, parsePriceKWD, detectRegion } from '../normalize.js';
import { logger } from '../lib/log.js';
import { kuwaitDate } from '../lib/time.js';

export { STATUS };

/**
 * Turn resolved listings into the full colour x capacity matrix for `model`.
 * `found` is a Map variantKey -> { status, priceKWD, url, title }.
 * Unresolved cells are NOT_LISTED (never guessed).
 */
export function fillMatrix(model, found, checkedAt = new Date().toISOString()) {
  const rows = [];
  for (const c of model.colors) {
    for (const cap of model.capacities) {
      const key = variantKey(model.id, c.name, cap);
      const hit = found.get(key);
      rows.push({
        modelId: model.id, color: c.name, capacity: cap, key,
        status: hit?.status ?? STATUS.NOT_LISTED,
        priceKWD: hit?.priceKWD ?? null,
        url: hit?.url ?? null,
        title: hit?.title ?? null,
        note: hit?.note ?? null,
        reason: hit?.reason ?? null,
        region: hit?.region ?? null,
        qty: hit?.qty ?? null,
        ...(hit?.offers?.length > 1 ? { offers: hit.offers } : {}), // several regions at this shop
        checkedAt,
      });
    }
  }
  return rows;
}

export function errorMatrix(model, message, checkedAt = new Date().toISOString()) {
  const rows = [];
  for (const c of model.colors) {
    for (const cap of model.capacities) {
      rows.push({ modelId: model.id, color: c.name, capacity: cap, key: variantKey(model.id, c.name, cap), status: STATUS.ERROR, priceKWD: null, url: null, title: null, error: message, checkedAt });
    }
  }
  return rows;
}

/**
 * Classify a raw listing and add it to `found` (keyed by variant). When two listings resolve to
 * the same variant, IN_STOCK wins, then the lower price.
 */
export function addListing(found, { title, colorHint, capacityHint, modelHint, status, price, url, note, reason, region, qty }, log, { allowGrey = false } = {}) {
  const cls = classifyListing({ title, colorHint, capacityHint, modelHint, allowGrey });
  if (!cls) { log?.debug(`unresolved listing: ${title}`); return null; }
  const key = variantKey(cls.modelId, cls.color, cls.capacity);
  const entry = { status, priceKWD: parsePriceKWD(price), url, title, note: note || null, reason: reason || null, region: allowGrey ? (region ?? detectRegion(title)) : null, qty: qty ?? null, ...cls };
  const prev = found.get(key);
  // Others group: a shop may list the same variant in several regions (e.g. 990 Store's ME and US versions as
  // separate products). Keep the best one per region in `offers`; the row itself stays the best offer overall.
  const offers = allowGrey ? mergeOffer(prev?.offers ?? (prev ? [offerOf(prev)] : []), offerOf(entry)) : undefined;
  if (!prev || better(entry, prev)) found.set(key, entry);
  if (offers) found.get(key).offers = offers;
  return key;
}

const rankOf = (s) => (s === STATUS.IN_STOCK ? 2 : s === STATUS.OUT_OF_STOCK ? 1 : 0);
/** In stock beats out of stock beats anything else; then the lower price wins. */
const better = (a, b) => rankOf(a.status) > rankOf(b.status) || (rankOf(a.status) === rankOf(b.status) && (a.priceKWD ?? Infinity) < (b.priceKWD ?? Infinity));
const offerOf = (e) => ({ region: e.region ?? null, status: e.status, priceKWD: e.priceKWD, url: e.url ?? null, note: e.note ?? null, qty: e.qty ?? null });
function mergeOffer(offers, o) {
  const i = offers.findIndex((x) => x.region === o.region);
  if (i === -1) return [...offers, o];
  return better(o, offers[i]) ? offers.map((x, j) => (j === i ? o : x)) : offers;
}

export function makeLogger(id) { return logger(`site:${id}`); }

/** Generic "listing catalogue" adapter: subclasses implement fetchListings() -> raw listings[] */
export class CatalogAdapter {
  constructor({ id, name, baseUrl, group = 'official' }) {
    this.id = id; this.name = name; this.baseUrl = baseUrl;
    this.group = group; // 'official' resellers or 'others' (grey imports allowed, region tagged)
    this.log = makeLogger(id);
    this.found = new Map();
    this.discovered = null; // { listings, source, at }
  }

  /** returns { listings: n, resolved: n, source } */
  async discover() {
    this.found = new Map();
    const { listings, source } = await this.fetchListings();
    let resolved = 0;
    for (const l of listings) if (addListing(this.found, l, this.log, { allowGrey: this.group === 'others' })) resolved++;
    this.discovered = { listings: listings.length, resolved, source, at: new Date().toISOString() };
    this.log.info(`discover: ${listings.length} listings, ${resolved} resolved to variants (${source})`);
    return this.discovered;
  }

  async checkModel(model) {
    if (!this.discovered) await this.discover();
    return fillMatrix(model, this.found).map(({ modelId, ...r }) => preorderGuard(model, r));
  }
}

/**
 * Nothing can be bought before a model's pre-order date. Some shops (e.g. Telefonati's iPhone Duo page,
 * verified 2026-10-05) mark a "COMING SOON" product as available in their feed; this turns that into
 * OUT_OF_STOCK with a "Coming soon" note instead of a false "In stock".
 */
export function preorderGuard(model, row, today = kuwaitDate()) {
  if (row.status !== STATUS.IN_STOCK || !model.preorderOpens || today >= model.preorderOpens) return row;
  return { ...row, status: STATUS.OUT_OF_STOCK, note: 'Coming soon', reason: `Shop marks it available, but pre-orders only open ${model.preorderOpens}` };
}
