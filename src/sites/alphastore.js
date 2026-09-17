// Alpha Store (alphastore.com.kw) - LINK-ONLY retailer.
// Their whole site (pages, robots.txt, WooCommerce API) sits behind SiteGround's anti-bot challenge, so this
// adapter makes NO requests and reports no stock status. It only provides a deep link per variant so the
// dashboard can offer a one-tap "Check site". Product pages follow a regular slug (verified by hand on
// 2026-09-17 for all 40 variants): /product/<model-id>-<capacity>-<colour-kebab>/
import selectors from '../../config/selectors.js';
import { variantKey, STATUS } from '../../config/variants.js';

const cfg = selectors.alphastore;
const kebab = (s) => s.toLowerCase().replace(/\s+/g, '-');

export default {
  id: 'alphastore',
  name: 'Alpha Store',
  baseUrl: cfg.base,
  linkOnly: true,
  async discover() { return { listings: 0, resolved: 0, source: 'link-only' }; },
  async checkModel(model) {
    const checkedAt = new Date().toISOString();
    const rows = [];
    for (const c of model.colors) for (const cap of model.capacities) {
      rows.push({ color: c.name, capacity: cap, key: variantKey(model.id, c.name, cap), status: STATUS.NOT_LISTED, priceKWD: null, url: cfg.productUrl(model.id, cap.toLowerCase(), kebab(c.name)), title: null, note: 'Check site', reason: 'Alpha Store blocks automated checks, so this is a link only', checkedAt });
    }
    return rows;
  },
};
