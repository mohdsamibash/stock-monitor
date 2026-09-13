import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const STOCK_FILE = path.join(DATA_DIR, 'stock.json');
export const HISTORY_FILE = path.join(DATA_DIR, 'history.jsonl');
export const STATE_FILE = path.join(DATA_DIR, 'state.json');
export const REQUEST_LOG_FILE = path.join(DATA_DIR, 'request-log.json');
export const PROPOSALS_FILE = path.join(DATA_DIR, 'selector-proposals.json');
export const AI_USAGE_FILE = path.join(DATA_DIR, 'ai-usage.jsonl');

fs.mkdirSync(DATA_DIR, { recursive: true });

export function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
export function writeJson(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
export function appendJsonl(file, obj) {
  fs.appendFileSync(file, JSON.stringify(obj) + '\n');
}
