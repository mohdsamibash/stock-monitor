// Scheduling profiles and launch days. All times are Asia/Kuwait.

export const TIMEZONE = 'Asia/Kuwait';

// Minutes between passes for each profile. "normal" is overridden by CHECK_INTERVAL_MINUTES in .env.
export const PROFILES = {
  burst: 4,
  normal: 15,
  quiet: 60,
};

// quiet profile applies from 00:00 up to (not including) 07:00
export const QUIET_HOURS = { start: 0, end: 7 };

// On these dates the burst profile is forced from LAUNCH_BURST_HOURS.start..end (no manual action).
export const LAUNCH_DAYS = [
  '2026-09-18', // iPhone 18 Pro / Pro Max release
  '2026-10-16', // iPhone Duo pre-order opens
  '2026-10-23', // iPhone Duo release
];

export const LAUNCH_BURST_HOURS = { start: 7, end: 23 };
