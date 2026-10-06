import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addListing, fillMatrix } from '../src/sites/base.js';
import { MODELS, STATUS } from '../config/variants.js';

const proMax = MODELS.find((m) => /max/i.test(m.id));
const add = (found, title, status, price, allowGrey = true) =>
  addListing(found, { title, colorHint: 'Glacier', status, price, url: `https://shop/${price}` }, null, { allowGrey });

test('others: one shop listing the same variant in two regions keeps both offers', () => {
  const found = new Map();
  add(found, 'iPhone 18 Pro Max 512GB (Middle East Version)', STATUS.IN_STOCK, '519.500');
  add(found, 'iPhone 18 Pro Max 512GB (US Version – A3473 | eSIM)', STATUS.IN_STOCK, '499.500');
  const row = fillMatrix(proMax, found).find((r) => r.color === 'Glacier' && r.capacity === '512GB');
  assert.equal(row.priceKWD, 499.5, 'row keeps the best (cheapest in-stock) offer');
  assert.equal(row.region, 'US');
  assert.deepEqual(row.offers.map((o) => [o.region, o.priceKWD]).sort(), [['ME', 519.5], ['US', 499.5]]);
});

test('others: a single region gives no offers list', () => {
  const found = new Map();
  add(found, 'iPhone 18 Pro Max 512GB (Middle East Version)', STATUS.IN_STOCK, '519.500');
  const row = fillMatrix(proMax, found).find((r) => r.color === 'Glacier' && r.capacity === '512GB');
  assert.equal(row.offers, undefined);
});

test('others: same region listed twice keeps the better one', () => {
  const found = new Map();
  add(found, 'iPhone 18 Pro Max 512GB (Middle East Version)', STATUS.OUT_OF_STOCK, '510.000');
  add(found, 'iPhone 18 Pro Max 512GB (Middle East Version) KSA', STATUS.IN_STOCK, '525.000');
  add(found, 'iPhone 18 Pro Max 512GB (US Version)', STATUS.OUT_OF_STOCK, '490.000');
  const row = fillMatrix(proMax, found).find((r) => r.color === 'Glacier' && r.capacity === '512GB');
  const me = row.offers.find((o) => o.region === 'ME');
  assert.equal(me.status, STATUS.IN_STOCK);
  assert.equal(me.priceKWD, 525);
  assert.equal(row.status, STATUS.IN_STOCK);
});

test('official resellers never get an offers list', () => {
  const found = new Map();
  add(found, 'iPhone 18 Pro Max 512GB Glacier', STATUS.IN_STOCK, '519.900', false);
  add(found, 'Apple iPhone 18 Pro Max 512GB Glacier', STATUS.OUT_OF_STOCK, '519.900', false);
  const row = fillMatrix(proMax, found).find((r) => r.color === 'Glacier' && r.capacity === '512GB');
  assert.equal(row.offers, undefined);
});
