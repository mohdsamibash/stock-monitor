// `npm run publish` — push the current data/stock.json to the website immediately.
import { readJson, STOCK_FILE } from './lib/paths.js';
import { publishStock, publishConfigured } from './publish.js';
if (!publishConfigured()) { console.log('Set PUBLISH_URL and PUBLISH_TOKEN in .env first.'); process.exit(1); }
const stock = readJson(STOCK_FILE, null);
if (!stock) { console.log('No data/stock.json yet. Run `npm run check` first.'); process.exit(1); }
process.exit((await publishStock(stock)) ? 0 : 1);
