import { ENV } from '../lib/env.js';

export const id = 'telegram';
export function configured() { return Boolean(ENV.TELEGRAM_BOT_TOKEN && ENV.TELEGRAM_CHAT_ID); }

export async function send({ text }) {
  const res = await fetch(`https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: ENV.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`telegram HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
