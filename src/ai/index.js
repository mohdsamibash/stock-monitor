// Entry point the runner calls after every pass. Every branch is a no-op unless AI_ENABLED=true.
import { logger } from '../lib/log.js';
import { aiAvailable } from './client.js';
import { shouldTrigger, proposeSelectors } from './selfheal.js';
import { digestDue, runDigest } from './digest.js';

const log = logger('ai');

export async function aiAfterPass(stock, state) {
  if (!aiAvailable()) return;
  for (const site of stock.sites) {
    if (site.status === 'backoff') continue; // we didn't even query it
    if (shouldTrigger(site, state)) {
      try { await proposeSelectors(site, state); } catch (e) { log.warn(`self-heal failed for ${site.id}: ${e.message}`); }
    }
  }
  if (digestDue(state)) {
    try { await runDigest(state); } catch (e) { log.warn(`digest failed: ${e.message}`); }
  }
}
