'use strict';
// TIJDELIJK diagnose-endpoint voor de voorspelling. Toont per vast product de recente SKU
// en wat de zoekopdracht op naam teruggeeft, plus de huidige mand. Wordt verwijderd zodra
// de voorspelling werkt.
const { getNormalizedDeliveries } = require('./_lib/orders');
const { stapleProducts } = require('./_lib/analyze');
const { picnicRequest } = require('./_lib/picnic');
const { searchTopProduct } = require('./_lib/search');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  const auth = req.query.auth;
  if (!auth) { res.status(400).json({ error: 'auth ontbreekt' }); return; }

  try {
    const deliveries = await getNormalizedDeliveries(auth);
    const staples = stapleProducts(deliveries, { minFraction: 0.7 });

    const rows = [];
    for (const s of staples) {
      let search = null;
      try { search = await searchTopProduct(auth, s.name); } catch (e) { search = { error: String(e.message || e).slice(0, 120) }; }
      rows.push({ name: s.name, recentSku: s.productId, usualQty: s.usualQty, freq: s.frequencyPct, search });
    }

    const cart = await picnicRequest({ method: 'GET', path: '/cart', auth });
    const cartNames = (cart.json?.items || []).map(line => {
      const art = (line.items && line.items[0]) || {};
      return art.name || line.id;
    });

    res.status(200).json({ stapleCount: staples.length, rows, cartNames });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err).slice(0, 200), status: err.status });
  }
};
