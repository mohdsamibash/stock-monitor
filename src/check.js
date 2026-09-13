// `npm run check` — one pass, prints a summary table and exits.
import { runPass } from './runner.js';
import { pickProfile } from './schedule.js';
import { closeBrowser } from './lib/browser.js';
import { MODELS } from '../config/variants.js';

const args = process.argv.slice(2);
const profileArg = (args.find((a) => a.startsWith('--profile')) || '').split('=')[1] || args[args.indexOf('--profile') + 1];
const profile = pickProfile(new Date(), profileArg && !profileArg.startsWith('--') ? profileArg : undefined);

const stock = await runPass({ profile, trigger: 'check' });
printSummary(stock);
await closeBrowser();
process.exit(0);

export function printSummary(stock) {
  const ICON = { IN_STOCK: '✅', OUT_OF_STOCK: '❌', NOT_LISTED: '·', ERROR: '⚠' };
  console.log(`\n${stock.summary.inStock} of ${stock.summary.total} retailer×variant cells in stock · ${stock.pass.requests} requests · ${stock.pass.durationMs} ms · profile ${stock.profile.profile}`);
  for (const s of stock.sites) console.log(`  ${s.name.padEnd(7)} ${s.status.padEnd(7)} ${s.source || ''} ${s.listings != null ? `${s.listings} listings/${s.resolved} resolved` : ''} ${s.error ? '— ' + s.error : ''}`);
  const cols = stock.sites.map((s) => s.name.slice(0, 6).padEnd(7)).join('');
  for (const m of MODELS) {
    console.log(`\n${m.name.padEnd(28)}${cols}`);
    for (const c of m.colors) for (const cap of m.capacities) {
      const key = `${m.id}|${c.name}|${cap}`;
      const cells = stock.sites.map((s) => { const r = s.results.find((x) => x.key === key); return `${ICON[r.status]}${r.note ? '*' : ' '}${r.priceKWD != null ? r.priceKWD.toFixed(0) : '   '}`.padEnd(7); }).join('');
      console.log(`  ${(c.name + ' ' + cap).padEnd(26)}${cells}`);
    }
  }
  console.log('\n  * = retailer shows a pre-order note (e.g. Gait "Coming Soon" = allocation exhausted, or pre-orders not open yet)\n');
}
