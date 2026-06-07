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

const { s5Distribution } = require('../api/_lib/analyze');

const S5_FIXTURE = [
  { id: 'a', date: '2026-05-01T10:00:00.000Z', totalCents: 0, items: [
    { productId: 'p1', name: 'Appel', count: 1, priceCents: 200, category: 'Groente & fruit' },
    { productId: 'p2', name: 'Brood', count: 1, priceCents: 200, category: 'Brood & gebak' },
    { productId: 'p3', name: 'Cola', count: 1, priceCents: 600, category: 'Frisdrank' },
  ]},
];

test('s5Distribution berekent uitgaven-aandeel per vak', () => {
  const r = s5Distribution(S5_FIXTURE);
  // totaal 1000c: groente_fruit 200 (20%), granen 200 (20%), buiten 600 (60%)
  assert.strictEqual(r.shares.groente_fruit, 20);
  assert.strictEqual(r.shares.granen, 20);
  assert.strictEqual(r.shares.buiten, 60);
  assert.strictEqual(r.shares.eiwit, 0);
});

test('s5Distribution geeft vers-aandeel (groente_fruit)', () => {
  const r = s5Distribution(S5_FIXTURE);
  assert.strictEqual(r.freshPct, 20);
});

test('s5Distribution geeft nul-shares bij lege input', () => {
  const r = s5Distribution([]);
  assert.strictEqual(r.freshPct, 0);
  assert.strictEqual(r.shares.groente_fruit, 0);
});

const { orderRhythm } = require('../api/_lib/analyze');

const RHYTHM_FIXTURE = [
  { id: 'a', date: '2026-05-01T10:00:00.000Z', totalCents: 0, items: [{ productId:'p1', name:'x', count:2, priceCents:0, category:'' }] },
  { id: 'b', date: '2026-05-08T10:00:00.000Z', totalCents: 0, items: [{ productId:'p1', name:'x', count:4, priceCents:0, category:'' }] },
  { id: 'c', date: '2026-05-15T10:00:00.000Z', totalCents: 0, items: [{ productId:'p1', name:'x', count:6, priceCents:0, category:'' }] },
];

test('orderRhythm berekent gemiddeld aantal dagen tussen bestellingen', () => {
  const r = orderRhythm(RHYTHM_FIXTURE);
  assert.strictEqual(r.avgDaysBetween, 7); // 1->8->15 = 7 dagen telkens
});

test('orderRhythm berekent gemiddeld aantal producten per bestelling', () => {
  const r = orderRhythm(RHYTHM_FIXTURE);
  assert.strictEqual(r.avgItemsPerOrder, 4); // (2+4+6)/3
});

test('orderRhythm telt bestellingen', () => {
  assert.strictEqual(orderRhythm(RHYTHM_FIXTURE).orderCount, 3);
});

test('orderRhythm is veilig bij 0 of 1 bestelling', () => {
  assert.deepStrictEqual(orderRhythm([]), { avgDaysBetween: 0, avgItemsPerOrder: 0, orderCount: 0 });
  const one = orderRhythm([RHYTHM_FIXTURE[0]]);
  assert.strictEqual(one.avgDaysBetween, 0);
  assert.strictEqual(one.orderCount, 1);
});
