import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyListing, matchModel, matchCapacity, matchColor, normalizeText, parsePriceKWD } from '../src/normalize.js';

test('normalizes arabic digits and diacritics', () => {
  assert.equal(normalizeText('آيفون ١٨ برو'), 'ايفون 18 برو');
});

test('pro max never collapses to pro', () => {
  assert.equal(matchModel('Apple iPhone 18 Pro Max 512GB'), 'iphone-18-pro-max');
  assert.equal(matchModel('P.O IPH 18 PRO - Black'), 'iphone-18-pro');
  assert.equal(matchModel('ايفون 18 برو ماكس'), 'iphone-18-pro-max');
});

test('capacity aliases', () => {
  assert.equal(matchCapacity('1024GB'), '1TB');
  assert.equal(matchCapacity('2 تيرا'), '2TB');
  assert.equal(matchCapacity('256 GB'), '256GB');
});

test('colour aliases are model-scoped', () => {
  assert.equal(matchColor('Blue', 'iphone-18-pro'), 'Glacier');
  assert.equal(matchColor('Blue', 'iphone-duo'), null);
  assert.equal(matchColor('أبيض', 'iphone-duo'), 'Star White');
});

test('accessories and grey imports are rejected', () => {
  assert.equal(classifyListing({ title: 'PanzerGlass Case For iPhone 18 Pro Max - Clear' }), null);
  assert.equal(classifyListing({ title: 'Apple iPhone 18 pro max 1TB Blue - Japanese VR' }), null);
});

test('real retailer titles classify', () => {
  assert.deepEqual(classifyListing({ title: 'Apple iPhone 18 Pro Max 512GB - Silver - Middle East' }), { modelId: 'iphone-18-pro-max', color: 'Silver', capacity: '512GB' });
  assert.deepEqual(classifyListing({ title: 'Pre-Order Apple iPhone 18 Pro Phone, A20 Pro chip, 256GB, 6.3-Inch, P.O IPH 18 PRO - Black' }), { modelId: 'iphone-18-pro', color: 'Black', capacity: '256GB' });
  assert.equal(classifyListing({ title: 'Apple iPhone 18 Pro 256GB' }), null, 'missing colour -> unresolved');
});

test('price parsing', () => {
  assert.equal(parsePriceKWD('444.900'), 444.9);
  assert.equal(parsePriceKWD('KD 1,164.900'), 1164.9);
  assert.equal(parsePriceKWD(null), null);
});

test('regions are detected only when stated', async () => {
  const { detectRegion } = await import('../src/normalize.js');
  assert.equal(detectRegion('Apple iPhone 18 Pro Max 1TB Glacier eSim (Japan Version)'), 'JP');
  assert.equal(detectRegion('Apple iPhone 18 Pro 6.3 Inch 512GB Silver American VR'), 'US');
  assert.equal(detectRegion('Apple iPhone 18 Pro - 512GB / Burgundy / 5G / Middle East Version'), 'ME');
  assert.equal(detectRegion('Apple iPhone 18 Pro 512GB 12GB RAM 6.3 inch ESIM - Glacier'), null);
});

test('grey imports: rejected for official, accepted for others', () => {
  const t = 'Apple iPhone 18 Pro Max Mobile 2TB - Burgundy eSim (Japan Version)';
  assert.equal(classifyListing({ title: t }), null);
  assert.deepEqual(classifyListing({ title: t, allowGrey: true }), { modelId: 'iphone-18-pro-max', color: 'Burgundy', capacity: '2TB' });
  assert.equal(classifyListing({ title: 'Apple iPhone 18 Pro Max Silicone Case with MagSafe - Burgundy', allowGrey: true }), null, 'accessories always rejected');
});
