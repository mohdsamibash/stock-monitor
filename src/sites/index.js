// Retailer registry. To add a retailer: create src/sites/<id>.js exporting an adapter with the
// shared interface (see base.js), then add it here. Order = column order in the dashboard.
import gait from './gait.js';
import xcite from './xcite.js';
import digits from './digits.js';

export const SITES = [gait, xcite, digits];
export const siteById = (id) => SITES.find((s) => s.id === id);
