import { TIMEZONE } from '../../config/schedule.js';

// Returns { date: 'YYYY-MM-DD', hour: 0-23, minute } for `d` in Asia/Kuwait.
export function kuwaitParts(d = new Date(), tz = TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const hour = Number(get('hour')) % 24; // en-GB can emit "24" at midnight
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour, minute: Number(get('minute')) };
}

export function kuwaitDate(d = new Date()) { return kuwaitParts(d).date; }

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function randomBetween(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }

export function relativeTime(iso, now = Date.now()) {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
