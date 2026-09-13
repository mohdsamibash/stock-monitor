// Natural-language restock alert (Arabic + English), one model call per run, only when something changed.
import { ENV } from '../lib/env.js';
import { logger } from '../lib/log.js';
import { ask, aiAvailable } from './client.js';

const log = logger('ai:alerts');

export function plainAlert(transitions, stock) {
  const lines = [];
  for (const t of transitions) {
    const site = stock.sites.find((s) => s.id === t.siteId);
    const r = site?.results.find((x) => x.key === t.key);
    const model = stock.models.find((m) => m.id === r.modelId);
    const cheapest = isCheapest(stock, t.key, t.siteId);
    const price = r.priceKWD != null ? `${r.priceKWD.toFixed(3)} KWD` : 'price n/a';
    lines.push(`✅ متوفر الآن: ${model.name} ${r.color} ${r.capacity} لدى ${site.name} بسعر ${price}${cheapest ? ' (الأرخص)' : ''}`);
    lines.push(`✅ Back in stock: ${model.name} ${r.color} ${r.capacity} at ${site.name} for ${price}${cheapest ? ' (cheapest)' : ''}`);
    if (r.url) lines.push(r.url);
    lines.push('');
  }
  return lines.join('\n').trim();
}

export function isCheapest(stock, key, siteId) {
  const prices = stock.sites.map((s) => ({ id: s.id, r: s.results.find((x) => x.key === key) })).filter((x) => x.r && x.r.status === 'IN_STOCK' && x.r.priceKWD != null);
  if (!prices.length) return false;
  const min = Math.min(...prices.map((p) => p.r.priceKWD));
  return prices.find((p) => p.id === siteId)?.r.priceKWD === min;
}

export async function composeAlert(transitions, stock) {
  const fallback = plainAlert(transitions, stock);
  if (!aiAvailable() || !ENV.AI_ALERTS) return fallback;
  const facts = transitions.map((t) => {
    const site = stock.sites.find((s) => s.id === t.siteId);
    const r = site.results.find((x) => x.key === t.key);
    const model = stock.models.find((m) => m.id === r.modelId);
    const others = stock.sites.filter((s) => s.id !== t.siteId).map((s) => { const o = s.results.find((x) => x.key === t.key); return `${s.name}: ${o?.status}${o?.priceKWD != null ? ` ${o.priceKWD} KWD` : ''}`; });
    return { model: model.name, color: r.color, capacity: r.capacity, retailer: site.name, priceKWD: r.priceKWD, url: r.url, cheapest: isCheapest(stock, t.key, t.siteId), otherRetailers: others };
  });
  try {
    const { text } = await ask({
      purpose: 'alert',
      system: 'You write concise stock alerts for a Kuwaiti iPhone buyer. Output plain text only (no markdown). Write the Arabic version first, then the English version. Name the model, colour, capacity, retailer and KWD price, and say whether it is the cheapest option across retailers. Include the URL on its own line. Keep it under 80 words per language.',
      user: `These variants just flipped from OUT_OF_STOCK to IN_STOCK:\n${JSON.stringify(facts, null, 2)}`,
      maxTokens: 800,
    });
    return text || fallback;
  } catch (e) { log.warn(`alert composition failed, using plain template: ${e.message}`); return fallback; }
}
