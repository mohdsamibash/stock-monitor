import { PROFILES, QUIET_HOURS, LAUNCH_DAYS, LAUNCH_BURST_HOURS } from '../config/schedule.js';
import { ENV } from './lib/env.js';
import { kuwaitParts } from './lib/time.js';

export const PROFILE_NAMES = Object.keys(PROFILES);

export function intervalFor(profile) {
  if (profile === 'normal') return ENV.CHECK_INTERVAL_MINUTES || PROFILES.normal;
  return PROFILES[profile];
}

/**
 * pickProfile(now, override) -> { profile, intervalMinutes, reason, launchDay }
 * override: 'burst'|'normal'|'quiet' (manual) or undefined/'auto'
 */
export function pickProfile(now = new Date(), override) {
  const { date, hour } = kuwaitParts(now);
  const launchDay = LAUNCH_DAYS.includes(date);
  if (override && override !== 'auto') {
    if (!PROFILES[override]) throw new Error(`Unknown profile "${override}". Use one of: ${PROFILE_NAMES.join(', ')}`);
    return { profile: override, intervalMinutes: intervalFor(override), reason: 'manual --profile', launchDay };
  }
  if (launchDay && hour >= LAUNCH_BURST_HOURS.start && hour < LAUNCH_BURST_HOURS.end) {
    return { profile: 'burst', intervalMinutes: intervalFor('burst'), reason: `launch day ${date}`, launchDay };
  }
  if (hour >= QUIET_HOURS.start && hour < QUIET_HOURS.end) {
    return { profile: 'quiet', intervalMinutes: intervalFor('quiet'), reason: 'quiet hours 00:00-07:00', launchDay };
  }
  return { profile: 'normal', intervalMinutes: intervalFor('normal'), reason: 'time of day', launchDay };
}
