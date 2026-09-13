// Backwards-compatible shim: alerts now go through src/alerts/index.js (Telegram, ntfy, macOS).
import { sendAlert, alertsConfigured } from './alerts/index.js';
export const telegramConfigured = alertsConfigured;
export async function sendTelegram(text, title) { const r = await sendAlert({ title, text }); return r.some((x) => x.ok); }
