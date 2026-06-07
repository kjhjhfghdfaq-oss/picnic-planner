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

module.exports = { S5_BUCKETS, mapCategoryToS5, aggregateSpending, topProducts, s5Distribution };
