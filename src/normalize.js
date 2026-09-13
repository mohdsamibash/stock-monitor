// Text normalisation + alias matching. Pure functions, no I/O.
import { MODEL_ALIASES, COLOR_ALIASES, CAPACITY_ALIASES, EXCLUDE_KEYWORDS, PHONE_HINTS } from '../config/aliases.js';
import { MODELS } from '../config/variants.js';

const ARABIC_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };

export function normalizeText(s) {
  if (s == null) return '';
  let t = String(s).toLowerCase();
  t = t.replace(/[٠-٩]/g, (d) => ARABIC_DIGITS[d]);
  t = t.normalize('NFKD').replace(/[\u0300-\u036f\u064B-\u0655\u0670]/g, ''); // latin + arabic diacritics
  t = t.replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
  t = t.replace(/[^\p{L}\p{N}]+/gu, ' ');
  return t.replace(/\s+/g, ' ').trim();
}

const pad = (s) => ` ${s} `;
function containsAlias(normText, alias) {
  return pad(normText).includes(pad(normalizeText(alias)));
}

// Most specific model wins (longest matching alias across all models).
export function matchModel(text) {
  const t = normalizeText(text);
  let best = null;
  for (const [modelId, aliases] of Object.entries(MODEL_ALIASES)) {
    for (const a of aliases) {
      if (containsAlias(t, a)) {
        const len = normalizeText(a).length;
        if (!best || len > best.len) best = { modelId, len };
      }
    }
  }
  if (!best) return null;
  // "iphone 18 pro max" contains "18 pro" too; guard so that "pro" never wins over "pro max".
  if (best.modelId === 'iphone-18-pro' && containsAlias(t, 'pro max')) return 'iphone-18-pro-max';
  return best.modelId;
}

export function matchCapacity(text) {
  const t = normalizeText(text);
  let best = null;
  for (const [cap, aliases] of Object.entries(CAPACITY_ALIASES)) {
    for (const a of aliases) {
      if (containsAlias(t, a)) {
        const len = normalizeText(a).length;
        if (!best || len > best.len) best = { cap, len };
      }
    }
  }
  return best?.cap ?? null;
}

// Only colours the model ships in are candidates. Longest alias wins.
export function matchColor(text, modelId) {
  const model = MODELS.find((m) => m.id === modelId);
  if (!model) return null;
  const t = normalizeText(text);
  let best = null;
  for (const c of model.colors) {
    const aliases = [c.name, ...(COLOR_ALIASES[c.name] || [])];
    for (const a of aliases) {
      if (containsAlias(t, a)) {
        const len = normalizeText(a).length;
        if (!best || len > best.len) best = { color: c.name, len };
      }
    }
  }
  return best?.color ?? null;
}

export function isExcluded(text) {
  const t = normalizeText(text);
  return EXCLUDE_KEYWORDS.some((k) => containsAlias(t, k));
}

export function looksLikePhone(text) {
  const t = normalizeText(text);
  return PHONE_HINTS.some((k) => containsAlias(t, k));
}

// Convenience: classify one listing title (+ optional structured hints) into a variant.
// Returns null when any dimension cannot be resolved -> caller reports NOT_LISTED, never guesses.
export function classifyListing({ title, colorHint, capacityHint, modelHint }) {
  const text = [title, colorHint, capacityHint, modelHint].filter(Boolean).join(' | ');
  if (!looksLikePhone(text) || isExcluded(title)) return null;
  const modelId = (modelHint && matchModel(modelHint)) || matchModel(title) || matchModel(text);
  if (!modelId) return null;
  const capacity = (capacityHint && matchCapacity(capacityHint)) || matchCapacity(title) || matchCapacity(text);
  const color = (colorHint && matchColor(colorHint, modelId)) || matchColor(title, modelId) || matchColor(text, modelId);
  if (!capacity || !color) return null;
  return { modelId, color, capacity };
}

export function parsePriceKWD(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? round3(v) : null;
  const m = String(v).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return m ? round3(Number(m[1])) : null;
}
const round3 = (n) => Math.round(n * 1000) / 1000;
