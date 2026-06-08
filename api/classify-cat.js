'use strict';
// Async, niet-blokkerend endpoint voor de categorie-meter.
// Classificeert producten via Haiku (gecachet per product) en geeft:
// - category: overall aandelen per categorie-vak + freshPct + treatPct
// - monthly: maandelijkse vers/treat tijdlijn
// Faalt het: lege verdeling (HTTP 200), dashboard blijft staan.
const { resolveCategoryBuckets, CAT_BUCKETS } = require('./_lib/classify');
const { getAllDeliveries } = require('./_lib/orders');
const analyze = require('./_lib/analyze');

function emptyResponse() {
  return {
    category: { shares: {}, freshPct: 0, treatPct: 0 },
    monthly: [],
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

  const auth = req.query.auth;
  if (!auth) { res.status(400).json({ error: 'auth ontbreekt' }); return; }

  try {
    let deliveries;
    try {
      deliveries = await getAllDeliveries(auth);
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        res.status(401).json({ error: 'Niet ingelogd of sessie verlopen' });
        return;
      }
      throw err;
    }

    const productTotals = analyze.productTotals(deliveries);
    const buckets = await resolveCategoryBuckets(productTotals);
    const overall = analyze.categoryShares(productTotals, buckets, CAT_BUCKETS);

    // Maandelijkse vers/treat tijdlijn
    const TREAT_BUCKETS = new Set(['snacks', 'dranken', 'alcohol']);
    const monthMap = new Map(); // month -> { versCents, treatCents, totalCents }
    for (const d of deliveries) {
      const month = String(d.date).slice(0, 7);
      const mo = monthMap.get(month) || { versCents: 0, treatCents: 0, totalCents: 0 };
      for (const it of d.items || []) {
        const bucket = (buckets[it.productId]) || 'overig';
        const cents = it.priceCents || 0;
        if (bucket === 'vers') mo.versCents += cents;
        if (TREAT_BUCKETS.has(bucket)) mo.treatCents += cents;
        mo.totalCents += cents;
      }
      monthMap.set(month, mo);
    }
    const monthly = [...monthMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, mo]) => ({
        month,
        freshPct: mo.totalCents > 0 ? Math.round((mo.versCents / mo.totalCents) * 100) : 0,
        treatPct: mo.totalCents > 0 ? Math.round((mo.treatCents / mo.totalCents) * 100) : 0,
      }));

    res.status(200).json({ category: overall, monthly });
  } catch (err) {
    console.error('classify-cat error:', (err.message || '').replace(/sk-[a-zA-Z0-9-]{20,}/g, '***'));
    res.status(200).json(emptyResponse()); // niet-kritisch
  }
};
