'use strict';

const S5_BUCKETS = ['groente_fruit', 'granen', 'eiwit', 'zuivel', 'vetten', 'buiten'];

// Volgorde telt: eerste match wint. Trefwoorden zijn lowercase, matchen op substring.
const S5_KEYWORDS = [
  ['groente_fruit', ['groente', 'fruit', 'sla', 'salade', 'aardappel']],
  ['granen', ['brood', 'gebak', 'pasta', 'rijst', 'graan', 'ontbijtgranen', 'meel', 'cracker']],
  ['eiwit', ['vlees', 'vis', 'zeevruchten', 'kip', 'gehakt', 'vega', 'vegetarisch', 'vegan', 'peulvrucht', 'noten', 'tofu']],
  ['zuivel', ['zuivel', 'kaas', 'melk', 'yoghurt', 'ei', 'eieren']],
  ['vetten', ['olie', 'boter', 'margarine', 'azijn', 'vet']],
];

function mapCategoryToS5(category) {
  const c = String(category || '').toLowerCase();
  if (!c) return 'buiten';
  for (const [bucket, keywords] of S5_KEYWORDS) {
    if (keywords.some(k => {
      const i = c.indexOf(k);
      if (i === -1) return false;
      const pre = i === 0 || !/\w/.test(c[i - 1]);
      const post = i + k.length >= c.length || !/\w/.test(c[i + k.length]);
      return pre && post;
    })) return bucket;
  }
  return 'buiten';
}

function monthKey(iso) {
  return String(iso).slice(0, 7); // "YYYY-MM"
}

function aggregateSpending(deliveries, nowIso) {
  const byMonthMap = new Map();
  let total = 0;
  for (const d of deliveries) {
    const m = monthKey(d.date);
    byMonthMap.set(m, (byMonthMap.get(m) || 0) + d.totalCents);
    total += d.totalCents;
  }
  const byMonth = [...byMonthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, totalCents]) => ({ month, totalCents }));

  const thisMonth = monthKey(nowIso);
  const totalThisMonthCents = byMonthMap.get(thisMonth) || 0;
  const avgBasketCents = deliveries.length ? Math.round(total / deliveries.length) : 0;

  // Trend op AFGERONDE maanden: de lopende (huidige) maand telt niet mee,
  // anders lijkt een half-volle maand altijd een daling.
  const completed = byMonth.filter(m => m.month < thisMonth);
  let trendPct = 0;
  if (completed.length >= 2) {
    const last = completed[completed.length - 1].totalCents;
    const prev = completed[completed.length - 2].totalCents;
    trendPct = prev > 0 ? Math.round(((last - prev) / prev) * 100) : 0;
  }

  return { byMonth, totalThisMonthCents, avgBasketCents, trendPct };
}

function topProducts(deliveries, limit = 5) {
  const acc = new Map(); // productId -> { name, count, spendCents }
  for (const d of deliveries) {
    for (const it of d.items || []) {
      const cur = acc.get(it.productId) || { name: it.name, count: 0, spendCents: 0 };
      cur.count += it.count || 0;
      cur.spendCents += it.priceCents || 0;
      cur.name = it.name || cur.name;
      acc.set(it.productId, cur);
    }
  }
  const rows = [...acc.entries()].map(([productId, v]) => ({ productId, ...v }));
  const byCount = [...rows]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ productId, name, count }) => ({ productId, name, count }));
  const bySpend = [...rows]
    .sort((a, b) => b.spendCents - a.spendCents)
    .slice(0, limit)
    .map(({ productId, name, spendCents }) => ({ productId, name, spendCents }));
  return { byCount, bySpend };
}

function s5Distribution(deliveries) {
  const cents = {};
  for (const b of S5_BUCKETS) cents[b] = 0;
  let total = 0;
  for (const d of deliveries) {
    for (const it of d.items || []) {
      const bucket = mapCategoryToS5(it.category);
      cents[bucket] += it.priceCents || 0;
      total += it.priceCents || 0;
    }
  }
  const shares = {};
  for (const b of S5_BUCKETS) {
    shares[b] = total > 0 ? Math.round((cents[b] / total) * 100) : 0;
  }
  return { shares, freshPct: shares.groente_fruit };
}

// Totaal per uniek product over alle leveringen (voor S5-classificatie + verdeling).
function productTotals(deliveries) {
  const acc = new Map();
  for (const d of deliveries) {
    for (const it of d.items || []) {
      const cur = acc.get(it.productId) || { name: it.name, count: 0, spendCents: 0 };
      cur.count += it.count || 0;
      cur.spendCents += it.priceCents || 0;
      cur.name = it.name || cur.name;
      acc.set(it.productId, cur);
    }
  }
  return [...acc.entries()].map(([productId, v]) => ({ productId, ...v }));
}

// S5-verdeling op basis van een vooraf bepaalde bucket-map (productId -> S5-vak).
// products: [{productId, spendCents}]. Onbekende producten vallen in 'buiten'.
function s5SharesFromProductSpend(products, bucketByProduct) {
  const cents = {};
  for (const b of S5_BUCKETS) cents[b] = 0;
  let total = 0;
  for (const p of products || []) {
    const raw = bucketByProduct && bucketByProduct[p.productId];
    const bucket = S5_BUCKETS.includes(raw) ? raw : 'buiten';
    cents[bucket] += p.spendCents || 0;
    total += p.spendCents || 0;
  }
  const shares = {};
  for (const b of S5_BUCKETS) shares[b] = total > 0 ? Math.round((cents[b] / total) * 100) : 0;
  return { shares, freshPct: shares.groente_fruit };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function orderRhythm(deliveries) {
  const orderCount = deliveries.length;
  if (orderCount === 0) return { avgDaysBetween: 0, avgItemsPerOrder: 0, orderCount: 0 };

  const sorted = [...deliveries].sort((a, b) => new Date(a.date) - new Date(b.date));
  let totalGapDays = 0;
  for (let i = 1; i < sorted.length; i++) {
    totalGapDays += (new Date(sorted[i].date) - new Date(sorted[i - 1].date)) / DAY_MS;
  }
  const avgDaysBetween = sorted.length > 1 ? Math.round(totalGapDays / (sorted.length - 1)) : 0;

  const totalItems = deliveries.reduce(
    (s, d) => s + (d.items || []).reduce((n, it) => n + (it.count || 0), 0), 0);
  const avgItemsPerOrder = Math.round(totalItems / orderCount);

  return { avgDaysBetween, avgItemsPerOrder, orderCount };
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = values[0], bestN = 0;
  for (const [v, n] of counts) if (n > bestN) { best = v; bestN = n; }
  return best;
}

// Vaste boodschappen = producten die in een hoog aandeel van je recente bestellingen voorkomen.
// Frequentie-gebaseerd (niet timing): zo komen echte vaste producten naar boven en valt
// incidentele aankoop eruit. opts.minFraction = drempel (0.7 = streng).
function stapleProducts(deliveries, opts = {}) {
  const minFraction = opts.minFraction || 0.7;
  const recentN = opts.recentN || 12;
  const minOrders = opts.minOrders || 3;

  const sorted = [...deliveries].sort((a, b) => new Date(b.date) - new Date(a.date));
  const recent = sorted.slice(0, recentN);
  const denom = recent.length;
  if (denom === 0) return [];

  const byProduct = new Map(); // productId -> { name, deliveries, counts }
  for (const d of recent) {
    const seenInDelivery = new Set();
    for (const it of d.items || []) {
      if (!it.productId) continue;
      const cur = byProduct.get(it.productId) || { name: it.name, deliveries: 0, counts: [] };
      if (!seenInDelivery.has(it.productId)) { cur.deliveries += 1; seenInDelivery.add(it.productId); }
      cur.counts.push(it.count || 1);
      cur.name = it.name || cur.name;
      byProduct.set(it.productId, cur);
    }
  }

  const result = [];
  for (const [productId, info] of byProduct) {
    if (info.deliveries < minOrders) continue;
    const frequency = info.deliveries / denom;
    if (frequency < minFraction) continue;
    result.push({
      productId,
      name: info.name,
      usualQty: mostCommon(info.counts),
      frequencyPct: Math.round(frequency * 100),
      timesOrdered: info.deliveries,
    });
  }
  return result.sort((a, b) => b.frequencyPct - a.frequencyPct);
}

module.exports = {
  S5_BUCKETS, mapCategoryToS5, aggregateSpending,
  topProducts, s5Distribution, productTotals, s5SharesFromProductSpend,
  orderRhythm, stapleProducts,
};
