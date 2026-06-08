const { test } = require('node:test');
const assert = require('node:assert');

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

const { productTotals } = require('../api/_lib/analyze');

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

// ─── Unit B: nieuwe functies ────────────────────────────────────────────────

const {
  spendingTimeline, brandShare, topBySpend, orderTiming,
  productFrequency, uniqueProductCount, wrapped, unitsMatching, categoryShares,
} = require('../api/_lib/analyze');

// Fixture: 3 leveringen, 2 maanden, brands en parcels
const TIMELINE_FIXTURE = [
  {
    id: 'a', date: '2026-04-10T10:00:00.000+02:00', totalCents: 4000, parcels: 1,
    items: [
      { productId: 'p1', name: 'Picnic Melk', count: 2, priceCents: 300, brand: 'huismerk' },
      { productId: 'p2', name: 'Coca-Cola', count: 3, priceCents: 700, brand: 'amerk' },
    ],
  },
  {
    id: 'b', date: '2026-05-05T21:27:28.891+02:00', totalCents: 6000, parcels: 2,
    items: [
      { productId: 'p1', name: 'Picnic Melk', count: 2, priceCents: 400, brand: 'huismerk' },
      { productId: 'p3', name: 'Zalm', count: 1, priceCents: 900, brand: 'amerk' },
    ],
  },
  {
    id: 'c', date: '2026-05-20T09:00:00.000+02:00', totalCents: 5000, parcels: 0,
    items: [
      { productId: 'p2', name: 'Coca-Cola', count: 6, priceCents: 1200, brand: 'amerk' },
      { productId: 'p3', name: 'Zalm', count: 1, priceCents: 900, brand: 'amerk' },
    ],
  },
];

// ── spendingTimeline ──────────────────────────────────────────────────────────

test('spendingTimeline totalCents en avgOrderCents', () => {
  const r = spendingTimeline(TIMELINE_FIXTURE);
  assert.strictEqual(r.totalCents, 15000);          // 4000+6000+5000
  assert.strictEqual(r.avgOrderCents, 5000);         // 15000/3
});

test('spendingTimeline byMonth gesorteerd oplopend met orderCount en itemCount', () => {
  const r = spendingTimeline(TIMELINE_FIXTURE);
  assert.deepStrictEqual(r.byMonth, [
    { month: '2026-04', totalCents: 4000, orderCount: 1, itemCount: 5 },  // 2+3
    { month: '2026-05', totalCents: 11000, orderCount: 2, itemCount: 10 }, // 2+1+6+1
  ]);
});

test('spendingTimeline byYear gesorteerd oplopend', () => {
  const r = spendingTimeline(TIMELINE_FIXTURE);
  assert.deepStrictEqual(r.byYear, [
    { year: '2026', totalCents: 15000, orderCount: 3 },
  ]);
});

test('spendingTimeline leeg => nulwaarden en lege arrays', () => {
  const r = spendingTimeline([]);
  assert.strictEqual(r.totalCents, 0);
  assert.strictEqual(r.avgOrderCents, 0);
  assert.deepStrictEqual(r.byMonth, []);
  assert.deepStrictEqual(r.byYear, []);
});

// ── brandShare ────────────────────────────────────────────────────────────────

test('brandShare berekent huismerk vs amerk centen en percentage', () => {
  const r = brandShare(TIMELINE_FIXTURE);
  // huismerk: 300+400=700; amerk: 700+900+1200+900=3700; totaal=4400
  assert.strictEqual(r.huismerkCents, 700);
  assert.strictEqual(r.amerkCents, 3700);
  assert.strictEqual(r.huismerkPct, Math.round(700 / 4400 * 100)); // 16
});

test('brandShare leeg => nullen', () => {
  const r = brandShare([]);
  assert.strictEqual(r.huismerkCents, 0);
  assert.strictEqual(r.amerkCents, 0);
  assert.strictEqual(r.huismerkPct, 0);
});

test('brandShare 100% huismerk', () => {
  const d = [{ id: 'x', date: '2026-05-01T10:00:00Z', totalCents: 100, parcels: 0,
    items: [{ productId: 'q1', name: 'Picnic Water', count: 1, priceCents: 100, brand: 'huismerk' }] }];
  const r = brandShare(d);
  assert.strictEqual(r.huismerkPct, 100);
  assert.strictEqual(r.amerkCents, 0);
});

// ── topBySpend ────────────────────────────────────────────────────────────────

test('topBySpend sorteert op totale besteding, max n', () => {
  const r = topBySpend(TIMELINE_FIXTURE, 2);
  // p2: 700+1200=1900, p3: 900+900=1800, p1: 300+400=700
  assert.strictEqual(r[0].productId, 'p2');
  assert.strictEqual(r[0].spendCents, 1900);
  assert.strictEqual(r[0].count, 9); // 3+6
  assert.strictEqual(r[1].productId, 'p3');
  assert.strictEqual(r.length, 2);
});

test('topBySpend default n=10', () => {
  const r = topBySpend(TIMELINE_FIXTURE);
  assert.ok(r.length <= 10);
  assert.strictEqual(r[0].productId, 'p2');
});

test('topBySpend leeg => lege array', () => {
  assert.deepStrictEqual(topBySpend([]), []);
});

// ── orderTiming ───────────────────────────────────────────────────────────────

test('orderTiming byWeekday telt op wall-clock datum (ma=0)', () => {
  // 2026-04-10 = vrijdag (JS: 5 => map: (5+6)%7=4); 2026-05-05 = dinsdag (2 => (2+6)%7=1); 2026-05-20 = woensdag (3 => (3+6)%7=2)
  const r = orderTiming(TIMELINE_FIXTURE);
  assert.strictEqual(r.byWeekday.length, 7);
  assert.strictEqual(r.byWeekday[4], 1, 'vrijdag (index 4) = 1');
  assert.strictEqual(r.byWeekday[1], 1, 'dinsdag (index 1) = 1');
  assert.strictEqual(r.byWeekday[2], 1, 'woensdag (index 2) = 1');
  assert.strictEqual(r.byWeekday[0], 0, 'maandag = 0');
});

test('orderTiming byHour telt op wall-clock uur', () => {
  // uur uit ISO-string vóór tijdzone-offset: 10, 21, 09
  const r = orderTiming(TIMELINE_FIXTURE);
  assert.strictEqual(r.byHour.length, 24);
  assert.strictEqual(r.byHour[10], 1);
  assert.strictEqual(r.byHour[21], 1);
  assert.strictEqual(r.byHour[9], 1);
  assert.strictEqual(r.byHour[0], 0);
});

test('orderTiming byMonthCount groepeert op maand', () => {
  const r = orderTiming(TIMELINE_FIXTURE);
  const mc = r.byMonthCount;
  const apr = mc.find(x => x.month === '2026-04');
  const may = mc.find(x => x.month === '2026-05');
  assert.strictEqual(apr.orderCount, 1);
  assert.strictEqual(may.orderCount, 2);
});

test('orderTiming leeg => nullen', () => {
  const r = orderTiming([]);
  assert.strictEqual(r.byWeekday.length, 7);
  assert.ok(r.byWeekday.every(n => n === 0));
  assert.strictEqual(r.byHour.length, 24);
  assert.ok(r.byHour.every(n => n === 0));
  assert.deepStrictEqual(r.byMonthCount, []);
});

// ── productFrequency ──────────────────────────────────────────────────────────

test('productFrequency telt aanwezigheid per levering (max 1x per levering)', () => {
  // p1 in 2/3 leveringen, p2 in 2/3, p3 in 2/3
  const r = productFrequency(TIMELINE_FIXTURE);
  const p1 = r.find(x => x.productId === 'p1');
  assert.strictEqual(p1.timesOrdered, 2);
  assert.strictEqual(p1.frequencyPct, Math.round(2 / 3 * 100)); // 67
  assert.strictEqual(p1.usualQty, 2);
});

test('productFrequency gesorteerd op frequentie descending', () => {
  // Alle drie producten gelijk in dit fixture; zorg voor ongelijke data
  const unequal = [
    { id: 'x', date: '2026-05-01T10:00:00Z', totalCents: 0, parcels: 0,
      items: [{ productId: 'q1', name: 'A', count: 1, priceCents: 0, brand: 'amerk' },
              { productId: 'q2', name: 'B', count: 1, priceCents: 0, brand: 'amerk' }] },
    { id: 'y', date: '2026-05-08T10:00:00Z', totalCents: 0, parcels: 0,
      items: [{ productId: 'q1', name: 'A', count: 1, priceCents: 0, brand: 'amerk' }] },
  ];
  const r = productFrequency(unequal);
  assert.strictEqual(r[0].productId, 'q1'); // 100% eerst
  assert.strictEqual(r[1].productId, 'q2'); // 50% later
});

test('productFrequency leeg => lege array', () => {
  assert.deepStrictEqual(productFrequency([]), []);
});

test('productFrequency usualQty is de meest-voorkomende count', () => {
  // p1: telkens count 2, dus usualQty=2
  const r = productFrequency(TIMELINE_FIXTURE);
  const p1 = r.find(x => x.productId === 'p1');
  assert.strictEqual(p1.usualQty, 2);
});

// ── uniqueProductCount ────────────────────────────────────────────────────────

test('uniqueProductCount telt distinct productIds', () => {
  assert.strictEqual(uniqueProductCount(TIMELINE_FIXTURE), 3); // p1,p2,p3
});

test('uniqueProductCount leeg => 0', () => {
  assert.strictEqual(uniqueProductCount([]), 0);
});

// ── wrapped ───────────────────────────────────────────────────────────────────

test('wrapped mostBought is het product met hoogste totale count', () => {
  const r = wrapped(TIMELINE_FIXTURE);
  // p2: 3+6=9, p1:2+2=4, p3:1+1=2
  assert.strictEqual(r.mostBought.name, 'Coca-Cola');
  assert.strictEqual(r.mostBought.count, 9);
});

test('wrapped mostExpensiveOrderCents, totalOrders, totalParcels', () => {
  const r = wrapped(TIMELINE_FIXTURE);
  assert.strictEqual(r.mostExpensiveOrderCents, 6000);
  assert.strictEqual(r.totalOrders, 3);
  assert.strictEqual(r.totalParcels, 3); // 1+2+0
});

test('wrapped leeg => null mostBought, nullen', () => {
  const r = wrapped([]);
  assert.strictEqual(r.mostBought, null);
  assert.strictEqual(r.mostExpensiveOrderCents, 0);
  assert.strictEqual(r.totalOrders, 0);
  assert.strictEqual(r.totalParcels, 0);
});

// ── unitsMatching ─────────────────────────────────────────────────────────────

test('unitsMatching telt eenheden van producten waarvan naam matcht', () => {
  // 'Coca-Cola' matcht /cola/i: count 3+6=9
  assert.strictEqual(unitsMatching(TIMELINE_FIXTURE, /cola/i), 9);
});

test('unitsMatching geen match => 0', () => {
  assert.strictEqual(unitsMatching(TIMELINE_FIXTURE, /koffie/i), 0);
});

test('unitsMatching leeg => 0', () => {
  assert.strictEqual(unitsMatching([], /melk/i), 0);
});

// ── categoryShares ────────────────────────────────────────────────────────────

const CAT_PRODUCTS = [
  { productId: 'p1', spendCents: 200 },
  { productId: 'p2', spendCents: 300 },
  { productId: 'p3', spendCents: 100 },
  { productId: 'p4', spendCents: 400 },
];
const CAT_BUCKET_MAP = { p1: 'vers', p2: 'dranken', p3: 'snacks' }; // p4 onbekend => overig
const CAT_BUCKETS = ['vers', 'zuivel', 'dranken', 'snacks', 'alcohol', 'non_food', 'overig'];

test('categoryShares berekent aandelen per bucket', () => {
  const r = categoryShares(CAT_PRODUCTS, CAT_BUCKET_MAP, CAT_BUCKETS);
  // totaal 1000: vers=20%, dranken=30%, snacks=10%, overig=40%
  assert.strictEqual(r.shares.vers, 20);
  assert.strictEqual(r.shares.dranken, 30);
  assert.strictEqual(r.shares.snacks, 10);
  assert.strictEqual(r.shares.overig, 40);
  assert.strictEqual(r.shares.zuivel, 0);
});

test('categoryShares freshPct = aandeel vers', () => {
  const r = categoryShares(CAT_PRODUCTS, CAT_BUCKET_MAP, CAT_BUCKETS);
  assert.strictEqual(r.freshPct, 20);
});

test('categoryShares treatPct = snacks + dranken + alcohol', () => {
  const r = categoryShares(CAT_PRODUCTS, CAT_BUCKET_MAP, CAT_BUCKETS);
  // 10 (snacks) + 30 (dranken) + 0 (alcohol) = 40
  assert.strictEqual(r.treatPct, 40);
});

test('categoryShares onbekende bucket valt terug op laatste bucket (overig)', () => {
  const r = categoryShares([{ productId: 'unknown', spendCents: 100 }], {}, CAT_BUCKETS);
  assert.strictEqual(r.shares.overig, 100);
});

test('categoryShares leeg => nul-shares', () => {
  const r = categoryShares([], {}, CAT_BUCKETS);
  assert.strictEqual(r.freshPct, 0);
  assert.strictEqual(r.treatPct, 0);
  assert.ok(Object.values(r.shares).every(v => v === 0));
});
