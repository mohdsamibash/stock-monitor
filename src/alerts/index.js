// Pluggable alert channels. ALERT_CHANNELS=auto uses every channel that is configured
// (Telegram token+chat, NTFY_TOPIC, macOS when running on a Mac); or list them explicitly:
// ALERT_CHANNELS=ntfy,macos
import { ENV } from '../lib/env.js';
import { logger } from '../lib/log.js';
import * as telegram from './telegram.js';
import * as ntfy from './ntfy.js';
import * as macos from './macos.js';

const log = logger('alerts');
const ALL = [telegram, ntfy, macos];

export function activeChannels() {
  const wanted = (ENV.ALERT_CHANNELS || 'auto').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const auto = wanted.includes('auto');
  return ALL.filter((c) => (auto ? c.configured() : wanted.includes(c.id)));
}

export function alertsConfigured() { return activeChannels().length > 0; }

/**
 * sendAlert({ title, text, url }) -> [{ channel, ok, error }]
 * Never throws: alerting is best effort and must not break a pass.
 */
export async function sendAlert({ title, text, url }) {
  const channels = activeChannels();
  if (!channels.length) { log.debug('no alert channel configured, skipping'); return []; }
  const results = await Promise.all(channels.map(async (c) => {
    try {
      if (!c.configured()) throw new Error('not configured');
      await c.send({ title, text, url });
      log.info(`alert sent via ${c.id}`);
      return { channel: c.id, ok: true };
    } catch (e) {
      log.warn(`alert via ${c.id} failed: ${e.message}`);
      return { channel: c.id, ok: false, error: e.message };
    }
  }));
  return results;
}
