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

test('mapCategoryToS5 matcht niet op deel-substrings', () => {
  assert.strictEqual(mapCategoryToS5('Conserven & provisies'), 'buiten'); // niet eiwit via "vis"
  assert.strictEqual(mapCategoryToS5('Reinigingsmiddelen'), 'buiten');    // niet zuivel via "ei"
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

test('aggregateSpending negeert de lopende maand voor de trend', () => {
  // mei is de lopende maand (now = 25 mei) => telt NIET mee voor de trend.
  // Er is maar één afgeronde maand (april), dus geen trend.
  const r = aggregateSpending(SPEND_FIXTURE, '2026-05-25T00:00:00.000Z');
  assert.strictEqual(r.trendPct, 0);
});

test('aggregateSpending trend vergelijkt de twee laatste afgeronde maanden', () => {
  const fx = [
    { id: 'm1', date: '2026-03-10T10:00:00.000Z', totalCents: 4000, items: [] },
    { id: 'm2', date: '2026-04-10T10:00:00.000Z', totalCents: 6000, items: [] },
    { id: 'm3', date: '2026-05-10T10:00:00.000Z', totalCents: 2000, items: [] }, // lopend, lager
  ];
  const r = aggregateSpending(fx, '2026-05-25T00:00:00.000Z');
  // april (6000) vs maart (4000) => +50%; mei telt niet mee
  assert.strictEqual(r.trendPct, 50);
  assert.strictEqual(r.totalThisMonthCents, 2000);
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

const { stapleProducts } = require('../api/_lib/analyze');

// p1 in 5/5 (100%), p2 in 4/5 (80%), p3 in 3/5 (60%), p4 in 1/5 (20%)
const STAPLE_FIXTURE = [
  { id: 's1', date: '2026-05-29T10:00:00.000Z', totalCents: 0, items: [
    { productId: 'p1', name: 'Bruiswater', count: 6, priceCents: 600, category: '' },
  ]},
  { id: 's2', date: '2026-05-22T10:00:00.000Z', totalCents: 0, items: [
    { productId: 'p1', name: 'Bruiswater', count: 6, priceCents: 600, category: '' },
    { productId: 'p2', name: 'Melk', count: 2, priceCents: 300, category: '' },
  ]},
  { id: 's3', date: '2026-05-15T10:00:00.000Z', totalCents: 0, items: [
    { productId: 'p1', name: 'Bruiswater', count: 6, priceCents: 600, category: '' },
    { productId: 'p2', name: 'Melk', count: 2, priceCents: 300, category: '' },
    { productId: 'p3', name: 'Koriander', count: 1, priceCents: 100, category: '' },
  ]},
  { id: 's4', date: '2026-05-08T10:00:00.000Z', totalCents: 0, items: [
    { productId: 'p1', name: 'Bruiswater', count: 6, priceCents: 600, category: '' },
    { productId: 'p2', name: 'Melk', count: 2, priceCents: 300, category: '' },
    { productId: 'p3', name: 'Koriander', count: 1, priceCents: 100, category: '' },
  ]},
  { id: 's5', date: '2026-05-01T10:00:00.000Z', totalCents: 0, items: [
    { productId: 'p1', name: 'Bruiswater', count: 6, priceCents: 600, category: '' },
    { productId: 'p2', name: 'Melk', count: 2, priceCents: 300, category: '' },
    { productId: 'p3', name: 'Koriander', count: 1, priceCents: 100, category: '' },
    { productId: 'p4', name: 'Eenmalig', count: 1, priceCents: 100, category: '' },
  ]},
];

test('stapleProducts (streng 0.7) geeft alleen vaste producten, gesorteerd op frequentie', () => {
  const r = stapleProducts(STAPLE_FIXTURE, { minFraction: 0.7 });
  assert.deepStrictEqual(r.map(x => x.productId), ['p1', 'p2']);
  const p1 = r.find(x => x.productId === 'p1');
  assert.strictEqual(p1.frequencyPct, 100);
  assert.strictEqual(p1.usualQty, 6);
});

test('stapleProducts (ruim 0.5) neemt ook semi-regelmatige producten mee', () => {
  const ids = stapleProducts(STAPLE_FIXTURE, { minFraction: 0.5 }).map(x => x.productId);
  assert.ok(ids.includes('p3'), 'p3 (60%) valt erbij op 0.5');
  assert.ok(!ids.includes('p4'), 'p4 (20%) valt af');
});

test('stapleProducts negeert producten met < minOrders voorkomens', () => {
  // lage drempel, maar p4 komt maar 1x voor (< minOrders 3) => valt af
  const r = stapleProducts(STAPLE_FIXTURE, { minFraction: 0.1 });
  assert.ok(!r.find(x => x.productId === 'p4'), 'p4 valt af op minOrders');
});

test('stapleProducts is leeg bij lege input', () => {
  assert.deepStrictEqual(stapleProducts([], { minFraction: 0.7 }), []);
});

const { productTotals, s5SharesFromProductSpend } = require('../api/_lib/analyze');

const TOTALS_FIXTURE = [
  { id: 'a', date: '2026-05-01T10:00:00.000Z', totalCents: 0, items: [
    { productId: 'p1', name: 'Bruiswater', count: 6, priceCents: 600, category: '' },
    { productId: 'p2', name: 'Melk', count: 2, priceCents: 300, category: '' },
  ]},
  { id: 'b', date: '2026-05-08T10:00:00.000Z', totalCents: 0, items: [
    { productId: 'p1', name: 'Bruiswater', count: 6, priceCents: 600, category: '' },
  ]},
];

test('productTotals telt aantal en uitgaven per uniek product', () => {
  const r = productTotals(TOTALS_FIXTURE);
  const p1 = r.find(x => x.productId === 'p1');
  const p2 = r.find(x => x.productId === 'p2');
  assert.deepStrictEqual(p1, { productId: 'p1', name: 'Bruiswater', count: 12, spendCents: 1200 });
  assert.deepStrictEqual(p2, { productId: 'p2', name: 'Melk', count: 2, spendCents: 300 });
  assert.deepStrictEqual(productTotals([]), []);
});

test('s5SharesFromProductSpend deelt uitgaven in via bucket-map', () => {
  const products = [
    { productId: 'p1', spendCents: 200 },
    { productId: 'p2', spendCents: 200 },
    { productId: 'p3', spendCents: 600 },
  ];
  const map = { p1: 'groente_fruit', p2: 'granen' }; // p3 onbekend => buiten
  const r = s5SharesFromProductSpend(products, map);
  assert.strictEqual(r.shares.groente_fruit, 20);
  assert.strictEqual(r.shares.granen, 20);
  assert.strictEqual(r.shares.buiten, 60);
  assert.strictEqual(r.shares.eiwit, 0);
  assert.strictEqual(r.freshPct, 20);
});

test('s5SharesFromProductSpend valt ongeldige bucket terug op buiten', () => {
  const r = s5SharesFromProductSpend([{ productId: 'x', spendCents: 100 }], { x: 'onzin' });
  assert.strictEqual(r.shares.buiten, 100);
});

test('s5SharesFromProductSpend leeg => nul', () => {
  const r = s5SharesFromProductSpend([], {});
  assert.strictEqual(r.freshPct, 0);
  assert.strictEqual(r.shares.granen, 0);
});
