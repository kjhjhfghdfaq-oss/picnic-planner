'use strict';
// TIJDELIJK, licht diagnose-endpoint: doet ALLEEN één zoekopdracht + haalt de mand op.
// Geen historie-ophaal (anders timeout). Verwijderd zodra de voorspelling werkt.
const { picnicRequest } = require('./_lib/picnic');
const { collectSellingUnits } = require('./_lib/search');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  const auth = req.query.auth;
  if (!auth) { res.status(400).json({ error: 'auth ontbreekt' }); return; }
  const q = req.query.q || 'Picnic water bruisend';

  try {
    const r = await picnicRequest({
      method: 'GET',
      path: `/pages/search-page-results?search_term=${encodeURIComponent(q)}`,
      auth,
    });
    const out = [];
    collectSellingUnits(r.json, out);

    const cart = await picnicRequest({ method: 'GET', path: '/cart', auth });
    const cartNames = (cart.json?.items || []).map(l => (l.items && l.items[0] && l.items[0].name) || l.id);

    res.status(200).json({ q, searchStatus: r.status, resultCount: out.length, results: out.slice(0, 10), cartNames });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err).slice(0, 200) });
  }
};
