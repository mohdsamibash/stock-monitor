import test from 'node:test';
import assert from 'node:assert/strict';
import { diffSnapshots, restockTransitions, availabilityWindows } from '../src/history.js';

test('diff detects flips and price changes, ignores first sightings', () => {
  const prev = { gait: { 'a|b|c': ['OUT_OF_STOCK', 1], 'x|y|z': ['IN_STOCK', 5] } };
  const next = { gait: { 'a|b|c': ['IN_STOCK', 1], 'x|y|z': ['IN_STOCK', 6], 'new|k|k': ['IN_STOCK', 1] } };
  const d = diffSnapshots(prev, next);
  assert.equal(d.length, 2);
  assert.equal(restockTransitions(d).length, 1);
});

test('availability windows', () => {
  const entries = [
    { ts: '2026-09-18T07:00:00Z', snapshot: { gait: { k: ['IN_STOCK', 1] } } },
    { ts: '2026-09-18T07:15:00Z', snapshot: { gait: { k: ['IN_STOCK', 1] } } },
    { ts: '2026-09-18T07:30:00Z', snapshot: { gait: { k: ['OUT_OF_STOCK', 1] } } },
  ];
  const w = availabilityWindows(entries);
  assert.deepEqual(w, [{ siteId: 'gait', key: 'k', from: '2026-09-18T07:00:00Z', to: '2026-09-18T07:30:00Z' }]);
});

test('alert rule modes', async () => {
  const { restockTransitions } = await import('../src/history.js');
  const changes = [
    { from: 'OUT_OF_STOCK', to: 'IN_STOCK' }, { from: 'NOT_LISTED', to: 'IN_STOCK' }, { from: 'ERROR', to: 'IN_STOCK' }, { from: 'IN_STOCK', to: 'OUT_OF_STOCK' },
  ];
  assert.equal(restockTransitions(changes, 'any-in-stock').length, 3);
  assert.equal(restockTransitions(changes, 'restock').length, 1);
});
