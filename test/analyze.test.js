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

const { aggregateSpending } = require('../api/_lib/analyze');

const SPEND_FIXTURE = [
  { id: 'a', date: '2026-04-10T10:00:00.000Z', totalCents: 4000, items: [] },
  { id: 'b', date: '2026-05-05T10:00:00.000Z', totalCents: 6000, items: [] },
  { id: 'c', date: '2026-05-20T10:00:00.000Z', totalCents: 5000, items: [] },
];

test('aggregateSpending groepeert per maand', () => {
  const r = aggregateSpending(SPEND_FIXTURE, '2026-05-25T00:00:00.000Z');
  assert.deepStrictEqual(r.byMonth, [
    { month: '2026-04', totalCents: 4000 },
    { month: '2026-05', totalCents: 11000 },
  ]);
});

test('aggregateSpending berekent totaal deze maand', () => {
  const r = aggregateSpending(SPEND_FIXTURE, '2026-05-25T00:00:00.000Z');
  assert.strictEqual(r.totalThisMonthCents, 11000);
});

test('aggregateSpending berekent gemiddelde mand', () => {
  const r = aggregateSpending(SPEND_FIXTURE, '2026-05-25T00:00:00.000Z');
  assert.strictEqual(r.avgBasketCents, 5000); // (4000+6000+5000)/3
});

test('aggregateSpending berekent trend t.o.v. vorige maand', () => {
  const r = aggregateSpending(SPEND_FIXTURE, '2026-05-25T00:00:00.000Z');
  // mei 11000 vs april 4000 => +175%
  assert.strictEqual(r.trendPct, 175);
});

test('aggregateSpending geeft nulwaarden bij lege historie', () => {
  const r = aggregateSpending([], '2026-05-25T00:00:00.000Z');
  assert.deepStrictEqual(r.byMonth, []);
  assert.strictEqual(r.totalThisMonthCents, 0);
  assert.strictEqual(r.avgBasketCents, 0);
  assert.strictEqual(r.trendPct, 0);
});

const { topProducts } = require('../api/_lib/analyze');

const PRODUCT_FIXTURE = [
  { id: 'a', date: '2026-05-01T10:00:00.000Z', totalCents: 0, items: [
    { productId: 'p1', name: 'Bruiswater', count: 6, priceCents: 600, category: 'Frisdrank' },
    { productId: 'p2', name: 'Melk', count: 2, priceCents: 300, category: 'Zuivel & eieren' },
  ]},
  { id: 'b', date: '2026-05-08T10:00:00.000Z', totalCents: 0, items: [
    { productId: 'p1', name: 'Bruiswater', count: 6, priceCents: 600, category: 'Frisdrank' },
    { productId: 'p3', name: 'Zalm', count: 1, priceCents: 900, category: 'Vis & zeevruchten' },
  ]},
];

test('topProducts sorteert op aantal', () => {
  const r = topProducts(PRODUCT_FIXTURE, 2);
  assert.deepStrictEqual(r.byCount, [
    { productId: 'p1', name: 'Bruiswater', count: 12 },
    { productId: 'p2', name: 'Melk', count: 2 },
  ]);
});

test('topProducts sorteert op uitgaven', () => {
  const r = topProducts(PRODUCT_FIXTURE, 2);
  assert.deepStrictEqual(r.bySpend, [
    { productId: 'p1', name: 'Bruiswater', spendCents: 1200 },
    { productId: 'p3', name: 'Zalm', spendCents: 900 },
  ]);
});

test('topProducts respecteert limit en lege input', () => {
  assert.strictEqual(topProducts(PRODUCT_FIXTURE, 1).byCount.length, 1);
  assert.deepStrictEqual(topProducts([], 5), { byCount: [], bySpend: [] });
});
