const { test } = require('node:test');
const assert = require('node:assert');
const { mapCategoryToS5, S5_BUCKETS } = require('../api/_lib/analyze');

test('mapCategoryToS5 plaatst groente en fruit in groente_fruit', () => {
  assert.strictEqual(mapCategoryToS5('Groente'), 'groente_fruit');
  assert.strictEqual(mapCategoryToS5('Verse fruit'), 'groente_fruit');
});

test('mapCategoryToS5 plaatst brood en pasta in granen', () => {
  assert.strictEqual(mapCategoryToS5('Brood & gebak'), 'granen');
  assert.strictEqual(mapCategoryToS5('Pasta en rijst'), 'granen');
});

test('mapCategoryToS5 plaatst vlees, vis en vega in eiwit', () => {
  assert.strictEqual(mapCategoryToS5('Vlees'), 'eiwit');
  assert.strictEqual(mapCategoryToS5('Vis & zeevruchten'), 'eiwit');
  assert.strictEqual(mapCategoryToS5('Vegetarisch & vegan'), 'eiwit');
});

test('mapCategoryToS5 plaatst zuivel in zuivel', () => {
  assert.strictEqual(mapCategoryToS5('Zuivel & eieren'), 'zuivel');
});

test('mapCategoryToS5 plaatst olie en boter in vetten', () => {
  assert.strictEqual(mapCategoryToS5('Olie & azijn'), 'vetten');
});

test('mapCategoryToS5 valt terug op buiten voor onbekend', () => {
  assert.strictEqual(mapCategoryToS5('Frisdrank'), 'buiten');
  assert.strictEqual(mapCategoryToS5(''), 'buiten');
  assert.strictEqual(mapCategoryToS5(undefined), 'buiten');
});

test('S5_BUCKETS bevat de zes vakken', () => {
  assert.deepStrictEqual(S5_BUCKETS, ['groente_fruit','granen','eiwit','zuivel','vetten','buiten']);
});
