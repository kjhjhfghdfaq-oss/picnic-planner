'use strict';

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

// Totaal per uniek product over alle leveringen (voor categorie-classificatie + verdeling).
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

// ─── Dashboard 2.0 pure functies ────────────────────────────────────────────

function yearKey(iso) {
  return String(iso).slice(0, 4); // "YYYY"
}

// Parseer wall-clock datum/uur uit een ISO-string (deel vóór de tijdzone-offset).
// "2026-06-01T21:27:28.891+02:00" → { year:2026, month:6, day:1, hour:21 }
function parseWallClock(iso) {
  const s = String(iso || '');
  // Neem alles vóór '+' of '-' (tijdzone) of 'Z', maar pas op voor het '-' in de datum.
  // Patroon: YYYY-MM-DDTHH:MM:SS...
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})/);
  if (!m) return { year: 0, month: 0, day: 0, hour: 0 };
  return { year: +m[1], month: +m[2], day: +m[3], hour: +m[4] };
}

function spendingTimeline(deliveries) {
  if (!deliveries.length) return { totalCents: 0, avgOrderCents: 0, byMonth: [], byYear: [] };

  const byMonthMap = new Map(); // month -> { totalCents, orderCount, itemCount }
  const byYearMap  = new Map(); // year  -> { totalCents, orderCount }
  let total = 0;

  for (const d of deliveries) {
    const m = monthKey(d.date);
    const y = yearKey(d.date);
    const itemCount = (d.items || []).reduce((s, it) => s + (it.count || 0), 0);

    const mo = byMonthMap.get(m) || { totalCents: 0, orderCount: 0, itemCount: 0 };
    mo.totalCents  += d.totalCents;
    mo.orderCount  += 1;
    mo.itemCount   += itemCount;
    byMonthMap.set(m, mo);

    const yr = byYearMap.get(y) || { totalCents: 0, orderCount: 0 };
    yr.totalCents += d.totalCents;
    yr.orderCount += 1;
    byYearMap.set(y, yr);

    total += d.totalCents;
  }

  const byMonth = [...byMonthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({ month, ...v }));

  const byYear = [...byYearMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, v]) => ({ year, ...v }));

  return {
    totalCents: total,
    avgOrderCents: Math.round(total / deliveries.length),
    byMonth,
    byYear,
  };
}

function brandShare(deliveries) {
  let huismerkCents = 0, amerkCents = 0;
  for (const d of deliveries) {
    for (const it of d.items || []) {
      if (it.brand === 'huismerk') huismerkCents += it.priceCents || 0;
      else amerkCents += it.priceCents || 0;
    }
  }
  const total = huismerkCents + amerkCents;
  const huismerkPct = total > 0 ? Math.round((huismerkCents / total) * 100) : 0;
  return { huismerkCents, amerkCents, huismerkPct };
}

function topBySpend(deliveries, n = 10) {
  const acc = new Map(); // productId -> { name, spendCents, count }
  for (const d of deliveries) {
    for (const it of d.items || []) {
      const cur = acc.get(it.productId) || { name: it.name, spendCents: 0, count: 0 };
      cur.spendCents += it.priceCents || 0;
      cur.count      += it.count || 0;
      cur.name        = it.name || cur.name;
      acc.set(it.productId, cur);
    }
  }
  return [...acc.entries()]
    .map(([productId, v]) => ({ productId, ...v }))
    .sort((a, b) => b.spendCents - a.spendCents)
    .slice(0, n);
}

function orderTiming(deliveries) {
  const byWeekday   = new Array(7).fill(0);  // 0=ma .. 6=zo
  const byHour      = new Array(24).fill(0);
  const byMonthMap  = new Map();

  for (const d of deliveries) {
    const { year, month, day, hour } = parseWallClock(d.date);
    // Weekdag via UTC zodat er geen zomertijd-shift kan optreden
    const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=zo
    byWeekday[(jsDay + 6) % 7] += 1;
    byHour[hour] += 1;

    const m = monthKey(d.date);
    byMonthMap.set(m, (byMonthMap.get(m) || 0) + 1);
  }

  const byMonthCount = [...byMonthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, orderCount]) => ({ month, orderCount }));

  return { byWeekday, byHour, byMonthCount };
}

function productFrequency(deliveries) {
  if (!deliveries.length) return [];

  const byProduct = new Map(); // productId -> { name, deliveries, counts[] }
  for (const d of deliveries) {
    const seen = new Set();
    for (const it of d.items || []) {
      if (!it.productId) continue;
      const cur = byProduct.get(it.productId) || { name: it.name, deliveries: 0, counts: [] };
      if (!seen.has(it.productId)) { cur.deliveries += 1; seen.add(it.productId); }
      cur.counts.push(it.count || 1);
      cur.name = it.name || cur.name;
      byProduct.set(it.productId, cur);
    }
  }

  const denom = deliveries.length;
  return [...byProduct.entries()]
    .map(([productId, info]) => ({
      productId,
      name: info.name,
      timesOrdered: info.deliveries,
      frequencyPct: Math.round((info.deliveries / denom) * 100),
      usualQty: mostCommon(info.counts),
    }))
    .sort((a, b) => b.frequencyPct - a.frequencyPct);
}

function uniqueProductCount(deliveries) {
  const ids = new Set();
  for (const d of deliveries) {
    for (const it of d.items || []) {
      if (it.productId) ids.add(it.productId);
    }
  }
  return ids.size;
}

function wrapped(deliveries) {
  if (!deliveries.length) {
    return { mostBought: null, mostExpensiveOrderCents: 0, totalOrders: 0, totalParcels: 0 };
  }

  const countByProduct = new Map();
  let mostExpensiveOrderCents = 0;
  let totalParcels = 0;

  for (const d of deliveries) {
    if (d.totalCents > mostExpensiveOrderCents) mostExpensiveOrderCents = d.totalCents;
    totalParcels += d.parcels || 0;
    for (const it of d.items || []) {
      const cur = countByProduct.get(it.productId) || { name: it.name, count: 0 };
      cur.count += it.count || 0;
      cur.name   = it.name || cur.name;
      countByProduct.set(it.productId, cur);
    }
  }

  let mostBought = null;
  for (const v of countByProduct.values()) {
    if (!mostBought || v.count > mostBought.count) mostBought = { name: v.name, count: v.count };
  }

  return { mostBought, mostExpensiveOrderCents, totalOrders: deliveries.length, totalParcels };
}

function unitsMatching(deliveries, regex) {
  let total = 0;
  for (const d of deliveries) {
    for (const it of d.items || []) {
      if (regex.test(it.name || '')) total += it.count || 0;
    }
  }
  return total;
}

// products: [{productId, spendCents}]
// bucketByProduct: productId -> bucket string
// buckets: ordered array of valid bucket names; unknown product → last bucket ('overig')
function categoryShares(products, bucketByProduct, buckets) {
  const fallback = buckets[buckets.length - 1];
  const cents = {};
  for (const b of buckets) cents[b] = 0;
  let total = 0;

  for (const p of products || []) {
    const raw = bucketByProduct && bucketByProduct[p.productId];
    const bucket = buckets.includes(raw) ? raw : fallback;
    cents[bucket] += p.spendCents || 0;
    total += p.spendCents || 0;
  }

  const shares = {};
  for (const b of buckets) shares[b] = total > 0 ? Math.round((cents[b] / total) * 100) : 0;

  const freshPct  = shares['vers'] || 0;
  const treatPct  = (shares['snacks'] || 0) + (shares['dranken'] || 0) + (shares['alcohol'] || 0);

  return { shares, freshPct, treatPct };
}

module.exports = {
  aggregateSpending,
  topProducts, productTotals,
  orderRhythm, stapleProducts,
  // Dashboard 2.0
  spendingTimeline, brandShare, topBySpend, orderTiming,
  productFrequency, uniqueProductCount, wrapped, unitsMatching, categoryShares,
};
