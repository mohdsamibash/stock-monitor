// Retailer registry. To add a retailer: create src/sites/<id>.js exporting an adapter with the
// shared interface (see base.js), then add it here. Order = column order in the dashboard.
import gait from './gait.js';
import xcite from './xcite.js';
import digits from './digits.js';

import { eureka, best, chips, mobile2000, wibi, soooq, store990, webstore, talabat, zayoom, telefonati, blink, trikart } from './others.js';

// group 'official' = Apple authorised resellers (Official tab); 'others' = everyone else (Others tab).
export const SITES = [gait, xcite, digits, eureka, best, chips, mobile2000, wibi, soooq, store990, webstore, talabat, zayoom, telefonati, blink, trikart];
export const siteById = (id) => SITES.find((s) => s.id === id);
