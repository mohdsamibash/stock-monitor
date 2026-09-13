// `npm run digest` — build and (if Telegram is configured) send the daily availability digest now.
import { loadState, saveState } from './runner.js';
import { runDigest } from './ai/digest.js';

const state = loadState();
const text = await runDigest(state, { send: !process.argv.includes('--dry') });
saveState(state);
console.log('\n' + text + '\n');
process.exit(0);
