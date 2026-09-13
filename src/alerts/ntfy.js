// ntfy.sh push notifications: no account, no bot. Install the ntfy app, subscribe to your topic.
import { ENV } from '../lib/env.js';

export const id = 'ntfy';
export function configured() { return Boolean(ENV.NTFY_TOPIC); }

export async function send({ title, text, url, priority = 'high' }) {
  const base = (ENV.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '');
  const headers = { 'content-type': 'text/plain; charset=utf-8', title: title || 'iPhone 18 stock', priority, tags: 'iphone,bell' };
  if (url) headers.click = url;
  if (ENV.NTFY_TOKEN) headers.authorization = `Bearer ${ENV.NTFY_TOKEN}`;
  const res = await fetch(`${base}/${encodeURIComponent(ENV.NTFY_TOPIC)}`, { method: 'POST', headers, body: text, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`ntfy HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
