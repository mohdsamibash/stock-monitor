// `npm run alert:test` — sends a test message through every active channel and reports the result.
import { sendAlert, activeChannels } from './alerts/index.js';
import { ENV } from './lib/env.js';

const channels = activeChannels();
console.log(`ALERT_CHANNELS=${ENV.ALERT_CHANNELS || 'auto'} -> active: ${channels.map((c) => c.id).join(', ') || 'none'}`);
if (!channels.length) {
  console.log('Nothing to test. Configure at least one of: TELEGRAM_BOT_TOKEN+TELEGRAM_CHAT_ID, NTFY_TOPIC, or run on a Mac (ALERT_MACOS=true).');
  process.exit(1);
}
const results = await sendAlert({
  title: 'iPhone 18 stock · test',
  text: '✅ اختبار التنبيهات يعمل\n✅ Test alert from the Kuwait iPhone 18 stock monitor\nhttps://gait.com.kw/g_kw_en/iphone-18-pro',
  url: 'https://gait.com.kw/g_kw_en/iphone-18-pro',
});
for (const r of results) console.log(`  ${r.ok ? '✔' : '✖'} ${r.channel}${r.error ? ' — ' + r.error : ''}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
