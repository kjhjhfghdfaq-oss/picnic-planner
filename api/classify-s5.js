'use strict';
// Async, niet-blokkerend endpoint voor de Schijf-van-Vijf-meter.
// Krijgt de productlijst van het dashboard, classificeert via Haiku (gecachet per product),
// en geeft de uitgaven-verdeling per S5-vak terug. Faalt het: lege verdeling, dashboard blijft staan.
const { resolveS5Buckets } = require('./_lib/classify');
const { s5SharesFromProductSpend, S5_BUCKETS } = require('./_lib/analyze');

function emptyShares() {
  const shares = {};
  for (const b of S5_BUCKETS) shares[b] = 0;
  return { shares, freshPct: 0 };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

  const products = (req.body && req.body.products) || [];
  if (!Array.isArray(products) || products.length === 0) {
    res.status(200).json({ s5: emptyShares() });
    return;
  }

  try {
    const buckets = await resolveS5Buckets(products);
    res.status(200).json({ s5: s5SharesFromProductSpend(products, buckets) });
  } catch (err) {
    console.error('classify-s5 error:', (err.message || '').replace(/sk-[a-zA-Z0-9-]{20,}/g, '***'));
    res.status(200).json({ s5: emptyShares() }); // niet-kritisch
  }
};
