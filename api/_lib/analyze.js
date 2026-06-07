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
    if (keywords.some(k => c.includes(k))) return bucket;
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
  const prevDate = new Date(nowIso);
  prevDate.setUTCMonth(prevDate.getUTCMonth() - 1);
  const prevMonth = monthKey(prevDate.toISOString());

  const totalThisMonthCents = byMonthMap.get(thisMonth) || 0;
  const prevCents = byMonthMap.get(prevMonth) || 0;
  const avgBasketCents = deliveries.length ? Math.round(total / deliveries.length) : 0;
  const trendPct = prevCents > 0
    ? Math.round(((totalThisMonthCents - prevCents) / prevCents) * 100)
    : 0;

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

function dueProducts(deliveries, nowIso, opts = {}) {
  const minOrders = opts.minOrders || 3;
  const maxCv = opts.maxCv || 0.5;       // max variatiecoëfficiënt op de intervallen
  const dueRatio = opts.dueRatio || 0.8; // due als daysSince >= avgInterval * dueRatio
  const now = new Date(nowIso);

  // verzamel per product: besteldatums + counts
  const byProduct = new Map();
  for (const d of deliveries) {
    for (const it of d.items || []) {
      const cur = byProduct.get(it.productId) || { name: it.name, dates: [], counts: [] };
      cur.dates.push(new Date(d.date));
      cur.counts.push(it.count || 1);
      cur.name = it.name || cur.name;
      byProduct.set(it.productId, cur);
    }
  }

  const result = [];
  for (const [productId, info] of byProduct) {
    if (info.dates.length < minOrders) continue;
    const dates = [...info.dates].sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < dates.length; i++) gaps.push((dates[i] - dates[i - 1]) / DAY_MS);
    const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    if (avg <= 0) continue;
    const variance = gaps.reduce((s, g) => s + (g - avg) ** 2, 0) / gaps.length;
    const cv = Math.sqrt(variance) / avg;
    if (cv > maxCv) continue; // te onregelmatig

    const lastOrdered = dates[dates.length - 1];
    const daysSince = (now - lastOrdered) / DAY_MS;
    if (daysSince < avg * dueRatio) continue; // nog niet toe

    result.push({
      productId,
      name: info.name,
      usualQty: mostCommon(info.counts),
      avgIntervalDays: Math.round(avg),
      lastOrdered: lastOrdered.toISOString(),
      daysSince: Math.round(daysSince),
    });
  }
  return result.sort((a, b) => b.daysSince - a.daysSince);
}

module.exports = {
  S5_BUCKETS, mapCategoryToS5, aggregateSpending,
  topProducts, s5Distribution, orderRhythm, dueProducts,
};
