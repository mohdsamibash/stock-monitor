import { ENV } from './env.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[ENV.LOG_LEVEL] ?? 20;

function fmt(level, scope, msg, extra) {
  const ts = new Date().toISOString().slice(11, 19);
  const tag = scope ? `[${scope}]` : '';
  let line = `${ts} ${level.toUpperCase().padEnd(5)} ${tag} ${msg}`;
  if (extra !== undefined) line += ' ' + (typeof extra === 'string' ? extra : JSON.stringify(extra));
  return line;
}

export function logger(scope) {
  const emit = (level) => (msg, extra) => {
    if (LEVELS[level] < threshold) return;
    const line = fmt(level, scope, msg, extra);
    (level === 'error' || level === 'warn' ? console.error : console.log)(line);
  };
  return { debug: emit('debug'), info: emit('info'), warn: emit('warn'), error: emit('error') };
}
