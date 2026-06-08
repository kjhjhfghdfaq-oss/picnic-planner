'use strict';
const { getAllDeliveries } = require('./_lib/orders');
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
    const deliveries = await getAllDeliveries(auth);

    const dashboard = {
      deliveryCount: deliveries.length,
      spending:      analyze.spendingTimeline(deliveries),
      brand:         analyze.brandShare(deliveries),
      topSpend:      analyze.topBySpend(deliveries, 10),
      timing:        analyze.orderTiming(deliveries),
      core:          analyze.productFrequency(deliveries).slice(0, 15),
      uniqueProducts: analyze.uniqueProductCount(deliveries),
      wrapped: {
        ...analyze.wrapped(deliveries),
        koffie: analyze.unitsMatching(deliveries, /koffie/i),
        melk:   analyze.unitsMatching(deliveries, /\bmelk\b/i),
      },
    };

    res.status(200).json(dashboard);
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      res.status(401).json({ error: 'Niet ingelogd of sessie verlopen' });
      return;
    }
    console.error('dashboard error:', (err.message || '').slice(0, 200));
    res.status(500).json({ error: 'Dashboard ophalen mislukt' });
  }
};
