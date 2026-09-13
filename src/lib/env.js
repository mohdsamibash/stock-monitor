import 'dotenv/config';

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));

export const ENV = {
  CHECK_INTERVAL_MINUTES: num(process.env.CHECK_INTERVAL_MINUTES, 15),
  PORT: num(process.env.PORT, 3000),
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
  ALERT_CHANNELS: process.env.ALERT_CHANNELS || "auto",
  ALERT_ON: (process.env.ALERT_ON || "any-in-stock").toLowerCase(),
  ALERT_CONFIRM_PASSES: num(process.env.ALERT_CONFIRM_PASSES, 1),
  NTFY_TOPIC: process.env.NTFY_TOPIC || "",
  NTFY_SERVER: process.env.NTFY_SERVER || "https://ntfy.sh",
  NTFY_TOKEN: process.env.NTFY_TOKEN || "",
  ALERT_MACOS: bool(process.env.ALERT_MACOS, true),
  ALERT_MACOS_SOUND: process.env.ALERT_MACOS_SOUND || "Glass",
  PUBLISH_URL: process.env.PUBLISH_URL || "",
  PUBLISH_TOKEN: process.env.PUBLISH_TOKEN || "",
  AI_ENABLED: bool(process.env.AI_ENABLED, false),
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  AI_MODEL: process.env.AI_MODEL || 'claude-sonnet-4-6',
  AI_SELF_HEAL: bool(process.env.AI_SELF_HEAL, true),
  AI_ALERTS: bool(process.env.AI_ALERTS, true),
  AI_DAILY_DIGEST: bool(process.env.AI_DAILY_DIGEST, true),
  AI_DIGEST_HOUR: num(process.env.AI_DIGEST_HOUR, 9),
  USER_AGENT: process.env.USER_AGENT || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 KW-StockMonitor/1.0',
  REQUEST_TIMEOUT_MS: num(process.env.REQUEST_TIMEOUT_MS, 20000),
  MAX_CONCURRENT_PER_DOMAIN: num(process.env.MAX_CONCURRENT_PER_DOMAIN, 2),
  MIN_DELAY_MS: num(process.env.MIN_DELAY_MS, 2000),
  MAX_DELAY_MS: num(process.env.MAX_DELAY_MS, 4000),
  REQUESTS_PER_HOUR_WARN: num(process.env.REQUESTS_PER_HOUR_WARN, 200),
  GAIT_ALLOCATION_CHECK: bool(process.env.GAIT_ALLOCATION_CHECK, true),
  DISABLE_BROWSER_FALLBACK: bool(process.env.DISABLE_BROWSER_FALLBACK, false),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};
