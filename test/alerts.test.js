import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmTransitions } from '../src/runner.js';
import { ENV } from '../src/lib/env.js';

test('flap protection waits for N consecutive in-stock passes', () => {
  ENV.ALERT_CONFIRM_PASSES = 2;
  const state = {};
  const t = { siteId: 'gait', key: 'k', from: 'OUT_OF_STOCK', to: 'IN_STOCK' };
  assert.equal(confirmTransitions([t], state, { gait: { k: ['IN_STOCK', 1] } }).length, 0, 'first pass: pending');
  assert.equal(confirmTransitions([], state, { gait: { k: ['IN_STOCK', 1] } }).length, 1, 'second pass: confirmed');
  assert.equal(confirmTransitions([t], state, { gait: { k: ['IN_STOCK', 1] } }).length, 0);
  assert.equal(confirmTransitions([], state, { gait: { k: ['OUT_OF_STOCK', 1] } }).length, 0, 'flapped back: dropped');
  assert.deepEqual(state.pendingAlerts, {});
  ENV.ALERT_CONFIRM_PASSES = 1;
  assert.equal(confirmTransitions([t], state, {}).length, 1, 'immediate when 1');
});
