// Native macOS notification banner with sound, via the built-in notification centre (osascript).
// Only fires on the machine running the watcher.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ENV } from '../lib/env.js';

const run = promisify(execFile);
export const id = 'macos';
export function configured() { return process.platform === 'darwin' && ENV.ALERT_MACOS; }

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export async function send({ title, text }) {
  // Notification centre truncates long bodies: keep the first two lines.
  const body = String(text).split('\n').filter(Boolean).slice(0, 2).join(' — ').slice(0, 240);
  const script = `display notification "${esc(body)}" with title "${esc(title || 'iPhone 18 stock')}" sound name "${esc(ENV.ALERT_MACOS_SOUND || 'Glass')}"`;
  await run('osascript', ['-e', script], { timeout: 10000 });
}
