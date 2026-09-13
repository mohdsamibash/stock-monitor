// Daily digest: once a day summarise which variants were available and for how long (from history.jsonl).
import { ENV } from '../lib/env.js';
import { logger } from '../lib/log.js';
import { readHistory, availabilityWindows } from '../history.js';
import { MODELS } from '../../config/variants.js';
import { kuwaitParts } from '../lib/time.js';
import { ask, aiAvailable } from './client.js';
import { sendAlert } from '../alerts/index.js';

const log = logger('ai:digest');

export function digestDue(state, now = new Date()) {
  if (!aiAvailable() || !ENV.AI_DAILY_DIGEST) return false;
  const { date, hour } = kuwaitParts(now);
  return hour >= ENV.AI_DIGEST_HOUR && state.ai?.lastDigestDate !== date;
}

export async function buildDigestFacts(hours = 24) {
  const entries = await readHistory({ sinceMs: Date.now() - hours * 3600_000 });
  const windows = availabilityWindows(entries);
  const now = Date.now();
  const rows = windows.map((w) => {
    const [modelId, color, capacity] = w.key.split('|');
    const model = MODELS.find((m) => m.id === modelId)?.name || modelId;
    const mins = Math.round(((w.to ? new Date(w.to).getTime() : now) - new Date(w.from).getTime()) / 60000);
    return { retailer: w.siteId, model, color, capacity, from: w.from, to: w.to, minutesAvailable: mins, stillAvailable: !w.to };
  });
  return { runs: entries.length, windows: rows, changes: entries.flatMap((e) => e.changes || []).length };
}

export async function runDigest(state, { send = true } = {}) {
  const facts = await buildDigestFacts(24);
  state.ai = state.ai || {}; state.ai.lastDigestDate = kuwaitParts().date;
  let text;
  if (aiAvailable()) {
    try {
      ({ text } = await ask({
        purpose: 'digest',
        system: 'You write a short daily digest for a Kuwaiti iPhone 18 stock monitor. Plain text, Arabic then English, under 150 words each. Group by retailer; say which variants were available and for how long (minutes/hours), and which are still available. If nothing was available, say so briefly.',
        user: JSON.stringify(facts, null, 2),
        maxTokens: 1200,
      }));
    } catch (e) { log.warn(`digest generation failed: ${e.message}`); }
  }
  if (!text) text = plainDigest(facts);
  log.info('daily digest:\n' + text);
  if (send) await sendAlert({ title: 'iPhone 18 daily digest', text });
  return text;
}

export function plainDigest(f) {
  if (!f.windows.length) return `Daily digest: ${f.runs} runs in the last 24 h, no variant was available at any retailer.`;
  const lines = [`Daily digest (${f.runs} runs, ${f.changes} changes):`];
  for (const w of f.windows) lines.push(`• ${w.retailer}: ${w.model} ${w.color} ${w.capacity} — ${w.minutesAvailable} min${w.stillAvailable ? ' (still available)' : ''}`);
  return lines.join('\n');
}
