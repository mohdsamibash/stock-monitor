// Retailer registry. To add a retailer: create src/sites/<id>.js exporting an adapter with the
// shared interface (see base.js), then add it here. Order = column order in the dashboard.
import gait from './gait.js';
import xcite from './xcite.js';
import digits from './digits.js';
import alphastore from './alphastore.js';

export const SITES = [gait, xcite, digits, alphastore];
export const siteById = (id) => SITES.find((s) => s.id === id);
