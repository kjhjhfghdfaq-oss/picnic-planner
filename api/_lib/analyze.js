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

module.exports = { S5_BUCKETS, mapCategoryToS5, aggregateSpending };
