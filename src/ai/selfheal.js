// Self-healing adapters: when a retailer returns ERROR/NOT_LISTED for every variant, fetch the
// page HTML (scripts/styles stripped, truncated), hand it to the model with the current selector
// config and ask for a JSON proposal. Nothing is auto-applied: the proposal is written to
// data/selector-proposals.json and a diff is printed for manual review. Max once per site / 6 h.
import selectors from '../../config/selectors.js';
import { ENV } from '../lib/env.js';
import { logger } from '../lib/log.js';
import { readJson, writeJson, PROPOSALS_FILE } from '../lib/paths.js';
import { fetchPolite } from '../lib/http.js';
import { ask, parseJsonReply, aiAvailable } from './client.js';

const log = logger('ai:selfheal');
const COOLDOWN_MS = 6 * 3600_000;
const MAX_HTML = 60_000;

const PAGE_FOR_SITE = {
  gait: () => selectors.gait.productUrl(selectors.gait.urlKeys['iphone-18-pro']),
  xcite: () => selectors.xcite.searchUrl('iPhone 18 Pro'),
  digits: () => `${selectors.digits.base}/collections/${selectors.digits.collections[0]}`,
  eureka: () => `${selectors.eureka.base}/?s=iphone+18&post_type=product`,
};

export function stripHtml(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, MAX_HTML);
}

function serializable(cfg) {
  return JSON.parse(JSON.stringify(cfg, (k, v) => (typeof v === 'function' ? `[fn ${v.toString().slice(0, 80)}]` : v)));
}

export function shouldTrigger(siteResult, state) {
  if (!siteResult?.results?.length) return false;
  const allBad = siteResult.results.every((r) => r.status === 'ERROR' || r.status === 'NOT_LISTED');
  if (!allBad) return false;
  const last = state.ai?.selfHeal?.[siteResult.id];
  return !last || Date.now() - new Date(last).getTime() > COOLDOWN_MS;
}

export async function proposeSelectors(site, state) {
  if (!aiAvailable() || !ENV.AI_SELF_HEAL) return null;
  const url = PAGE_FOR_SITE[site.id]?.();
  if (!url) return null;
  state.ai = state.ai || {}; state.ai.selfHeal = state.ai.selfHeal || {};
  state.ai.selfHeal[site.id] = new Date().toISOString(); // stamp first so a failure still respects the cooldown
  log.info(`${site.id}: every variant ERROR/NOT_LISTED -> asking the model for a selector proposal (${url})`);
  let html;
  try { html = stripHtml((await fetchPolite(url)).text); } catch (e) { log.warn(`could not fetch ${url}: ${e.message}`); return null; }
  const current = serializable(selectors[site.id]);
  const system = 'You are a senior web-scraping engineer. You maintain per-retailer configuration for a stock monitor. Reply with a single JSON object only, no prose, no markdown.';
  const user = `The adapter for retailer "${site.name}" (${site.baseUrl}) now resolves zero iPhone 18 variants, so the site layout or API probably changed.

Current config (functions shown as strings, keep them unchanged):
${JSON.stringify(current, null, 2)}

Stripped HTML of ${url} (truncated to ${MAX_HTML} chars):
"""
${html}
"""

Return JSON with exactly this shape:
{"confidence": 0.0-1.0, "reasoning": "one or two sentences", "changes": { <same keys as the config you want to change, with new values> }, "jsonEndpointHints": ["any JSON/GraphQL/Algolia endpoint you can infer from the HTML"]}
Only include keys in "changes" that should change. Prefer JSON endpoints over CSS selectors when the HTML reveals one.`;
  const { text, usage } = await ask({ purpose: `selfheal:${site.id}`, system, user, maxTokens: 3000 });
  let proposal;
  try { proposal = parseJsonReply(text); } catch (e) { log.warn(`unparsable proposal for ${site.id}: ${e.message}`); return null; }
  const all = readJson(PROPOSALS_FILE, {});
  all[site.id] = { at: new Date().toISOString(), url, model: usage.model, confidence: proposal.confidence, reasoning: proposal.reasoning, jsonEndpointHints: proposal.jsonEndpointHints, current, proposed: proposal.changes || {} };
  writeJson(PROPOSALS_FILE, all);
  printDiff(site.id, current, proposal.changes || {}, proposal.confidence);
  return all[site.id];
}

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out); else out[key] = v;
  }
  return out;
}

export function printDiff(siteId, current, proposed, confidence) {
  const a = flatten(current), b = flatten(proposed);
  console.log(`\n=== Selector proposal for ${siteId} (confidence ${confidence ?? '?'}) — NOT applied. Review data/selector-proposals.json ===`);
  for (const [k, v] of Object.entries(b)) {
    const before = JSON.stringify(a[k]);
    const after = JSON.stringify(v);
    if (before === after) continue;
    if (before !== undefined) console.log(`- ${k}: ${before}`);
    console.log(`+ ${k}: ${after}`);
  }
  console.log('=== end proposal ===\n');
}
