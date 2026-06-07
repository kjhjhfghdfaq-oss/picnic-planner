'use strict';
const { getNormalizedDeliveries } = require('./_lib/orders');
const analyze = require('./_lib/analyze');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

  const auth = req.query.auth;
  if (!auth) { res.status(400).json({ error: 'auth ontbreekt' }); return; }

  try {
    const deliveries = await getNormalizedDeliveries(auth);
    const now = new Date().toISOString();
    const dashboard = {
      spending: analyze.aggregateSpending(deliveries, now),
      topProducts: analyze.topProducts(deliveries, 5),
      rhythm: analyze.orderRhythm(deliveries),
      // productlijst voor de async S5-classificatie (zie /api/classify-s5)
      products: analyze.productTotals(deliveries).map(p => ({ productId: p.productId, name: p.name, spendCents: p.spendCents })),
    };
    res.status(200).json({ deliveryCount: deliveries.length, dashboard });
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      res.status(401).json({ error: 'Niet ingelogd of sessie verlopen' });
      return;
    }
    console.error('order-history error:', (err.message || '').slice(0, 200));
    res.status(500).json({ error: 'Bestelhistorie ophalen mislukt' });
  }
};
