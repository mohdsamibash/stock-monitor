import test from 'node:test';
import assert from 'node:assert/strict';
import { pickProfile } from '../src/schedule.js';

// Asia/Kuwait is UTC+3 all year.
const kw = (date, hour) => new Date(`${date}T${String(hour - 3).padStart(2, '0')}:30:00Z`);

test('quiet hours', () => { assert.equal(pickProfile(kw('2026-09-14', 3)).profile, 'quiet'); });
test('normal daytime', () => { assert.equal(pickProfile(kw('2026-09-14', 12)).profile, 'normal'); });
test('launch day forces burst 07-23', () => {
  assert.equal(pickProfile(kw('2026-09-18', 8)).profile, 'burst');
  assert.equal(pickProfile(kw('2026-10-16', 22)).profile, 'burst');
  assert.equal(pickProfile(kw('2026-09-18', 23)).profile, 'normal');
  assert.equal(pickProfile(kw('2026-09-18', 4)).profile, 'quiet');
});
test('manual override wins', () => { assert.equal(pickProfile(kw('2026-09-14', 3), 'burst').profile, 'burst'); });
test('unknown profile throws', () => { assert.throws(() => pickProfile(new Date(), 'turbo')); });
