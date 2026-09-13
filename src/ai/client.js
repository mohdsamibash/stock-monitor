// Thin wrapper around the Anthropic SDK: OFF unless AI_ENABLED=true and a key is present.
// Every call is logged to data/ai-usage.jsonl with token usage and an estimated USD cost.
import { ENV } from '../lib/env.js';
import { logger } from '../lib/log.js';
import { appendJsonl, AI_USAGE_FILE } from '../lib/paths.js';

const log = logger('ai');

// USD per 1M tokens (input, output). Extend when you change AI_MODEL.
const PRICES = {
  'claude-sonnet-4-6': [3, 15],
  'claude-sonnet-5': [2, 10],
  'claude-opus-5': [5, 25],
  'claude-haiku-4-5': [1, 5],
};

let clientPromise = null;
async function getClient() {
  if (!clientPromise) {
    clientPromise = import('@anthropic-ai/sdk').then(({ default: Anthropic }) => new Anthropic({ apiKey: ENV.ANTHROPIC_API_KEY }));
  }
  return clientPromise;
}

export function aiAvailable() {
  return ENV.AI_ENABLED && Boolean(ENV.ANTHROPIC_API_KEY);
}

/**
 * ask({ purpose, system, user, maxTokens }) -> { text, usage }
 * Throws when the API fails; callers must treat AI as best-effort.
 */
export async function ask({ purpose, system, user, maxTokens = 4000 }) {
  if (!aiAvailable()) throw new Error('AI layer disabled');
  const client = await getClient();
  const started = Date.now();
  const res = await client.messages.create({
    model: ENV.AI_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  const u = res.usage || {};
  const [pin, pout] = PRICES[ENV.AI_MODEL] || [0, 0];
  const cost = ((u.input_tokens || 0) * pin + (u.output_tokens || 0) * pout) / 1e6;
  const entry = { ts: new Date().toISOString(), purpose, model: res.model || ENV.AI_MODEL, input_tokens: u.input_tokens ?? null, output_tokens: u.output_tokens ?? null, cache_read_input_tokens: u.cache_read_input_tokens ?? 0, estCostUSD: Math.round(cost * 1e5) / 1e5, ms: Date.now() - started, stop_reason: res.stop_reason };
  appendJsonl(AI_USAGE_FILE, entry);
  log.info(`${purpose}: ${entry.input_tokens} in / ${entry.output_tokens} out tokens, ~$${entry.estCostUSD} (${entry.ms} ms)`);
  if (res.stop_reason === 'refusal') throw new Error('model refused the request');
  return { text, usage: entry };
}

// Extract the first JSON object from a model reply (tolerates ```json fences).
export function parseJsonReply(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON object in reply');
  return JSON.parse(candidate.slice(start, end + 1));
}
