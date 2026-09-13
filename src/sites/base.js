// Shared helpers for retailer adapters. Every adapter exports:
//   { id, name, baseUrl, discover(), checkModel(model) -> [{ color, capacity, status, priceKWD, url, checkedAt }] }
// discover() performs the (few) network requests for a pass and caches the parsed listings;
// checkModel() is pure filtering over that cache so no extra requests are made per model/variant.
import { STATUS, variantKey } from '../../config/variants.js';
import { classifyListing, parsePriceKWD } from '../normalize.js';
import { logger } from '../lib/log.js';

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
export function addListing(found, { title, colorHint, capacityHint, modelHint, status, price, url, note, reason }, log) {
  const cls = classifyListing({ title, colorHint, capacityHint, modelHint });
  if (!cls) { log?.debug(`unresolved listing: ${title}`); return null; }
  const key = variantKey(cls.modelId, cls.color, cls.capacity);
  const entry = { status, priceKWD: parsePriceKWD(price), url, title, note: note || null, reason: reason || null, ...cls };
  const prev = found.get(key);
  if (!prev) found.set(key, entry);
  else {
    const rank = (s) => (s === STATUS.IN_STOCK ? 2 : s === STATUS.OUT_OF_STOCK ? 1 : 0);
    if (rank(entry.status) > rank(prev.status) || (rank(entry.status) === rank(prev.status) && (entry.priceKWD ?? Infinity) < (prev.priceKWD ?? Infinity))) found.set(key, entry);
  }
  return key;
}

export function makeLogger(id) { return logger(`site:${id}`); }

/** Generic "listing catalogue" adapter: subclasses implement fetchListings() -> raw listings[] */
export class CatalogAdapter {
  constructor({ id, name, baseUrl }) {
    this.id = id; this.name = name; this.baseUrl = baseUrl;
    this.log = makeLogger(id);
    this.found = new Map();
    this.discovered = null; // { listings, source, at }
  }

  /** returns { listings: n, resolved: n, source } */
  async discover() {
    this.found = new Map();
    const { listings, source } = await this.fetchListings();
    let resolved = 0;
    for (const l of listings) if (addListing(this.found, l, this.log)) resolved++;
    this.discovered = { listings: listings.length, resolved, source, at: new Date().toISOString() };
    this.log.info(`discover: ${listings.length} listings, ${resolved} resolved to variants (${source})`);
    return this.discovered;
  }

  async checkModel(model) {
    if (!this.discovered) await this.discover();
    return fillMatrix(model, this.found).map(({ modelId, ...r }) => r);
  }
}
