// `npm run watch [-- --profile burst|normal|quiet]` — scheduled loop. Profile is re-evaluated before
// every pass (time of day, quiet hours, launch days) unless overridden.
import { runPass } from './runner.js';
import { pickProfile } from './schedule.js';
import { logger } from './lib/log.js';
import { sleep } from './lib/time.js';
import { remoteRefreshPending, publishConfigured } from './publish.js';

const log = logger('watch');

export function parseProfileArg(argv = process.argv.slice(2)) {
  const i = argv.findIndex((a) => a === '--profile' || a.startsWith('--profile='));
  if (i === -1) return undefined;
  const v = argv[i].includes('=') ? argv[i].split('=')[1] : argv[i + 1];
  return v && !v.startsWith('--') ? v : undefined;
}

export function startWatch({ profileOverride } = {}) {
  const ctl = { stopped: false, nextRunAt: null, current: null, wake: null };
  (async () => {
    while (!ctl.stopped) {
      const profile = pickProfile(new Date(), profileOverride);
      ctl.current = profile;
      log.info(`pass starting — profile ${profile.profile} (${profile.reason}), next in ${profile.intervalMinutes} min`);
      try { await runPass({ profile, trigger: 'watch' }); } catch (e) { log.error(`pass failed: ${e.message}`); }
      const next = pickProfile(new Date(), profileOverride); // interval may have changed during the pass
      ctl.nextRunAt = new Date(Date.now() + next.intervalMinutes * 60_000).toISOString();
      await new Promise((resolve) => { ctl.wake = resolve; setTimeout(resolve, next.intervalMinutes * 60_000); });
    }
  })();
  // Remote refresh: the public website queues a request in KV; wake the loop early when one is pending.
  if (publishConfigured()) {
    let busy = false;
    const timer = setInterval(async () => {
      if (ctl.stopped || busy) return;
      busy = true;
      try { if (await remoteRefreshPending()) { log.info('refresh requested from the website — running a pass now'); ctl.wake?.(); } }
      finally { busy = false; }
    }, 30_000);
    timer.unref?.();
  }
  ctl.stop = () => { ctl.stopped = true; ctl.wake?.(); };
  ctl.runNow = () => { ctl.wake?.(); };
  return ctl;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const override = parseProfileArg();
  log.info(`watch mode${override ? ` (profile forced: ${override})` : ' (auto profile)'} — Ctrl-C to stop`);
  startWatch({ profileOverride: override });
  process.on('SIGINT', () => { log.info('bye'); process.exit(0); });
  await sleep(2 ** 31 - 1);
}
