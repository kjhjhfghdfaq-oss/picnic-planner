'use strict';
// TIJDELIJK diagnose-endpoint.
//  ?q=term            → zoekt en geeft top-resultaten
//  ?add=<id>&count=N  → voert add_product echt uit en geeft de RUWE respons + mand erna
// Verwijderd zodra de voorspelling werkt.
const { picnicRequest } = require('./_lib/picnic');
const { collectSellingUnits } = require('./_lib/search');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  const auth = req.query.auth;
  if (!auth) { res.status(400).json({ error: 'auth ontbreekt' }); return; }

  try {
    const result = {};

    if (req.query.add) {
      const count = parseInt(req.query.count) || 1;
      const addResp = await picnicRequest({
        method: 'POST', path: '/cart/add_product', auth,
        body: { product_id: req.query.add, count },
      });
      result.add = { sent: { product_id: req.query.add, count }, status: addResp.status, body: String(addResp.raw || '').slice(0, 800) };
    }

    if (req.query.q) {
      const r = await picnicRequest({
        method: 'GET', path: `/pages/search-page-results?search_term=${encodeURIComponent(req.query.q)}`, auth,
      });
      const out = [];
      collectSellingUnits(r.json, out);
      result.search = { status: r.status, results: out.slice(0, 6) };
    }

    const cart = await picnicRequest({ method: 'GET', path: '/cart', auth });
    result.cart = (cart.json?.items || []).map(l => {
      const a = (l.items && l.items[0]) || {};
      return { name: a.name || l.id, id: a.id || l.id, qty: (l.items || []).length };
    });

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err).slice(0, 200) });
  }
};
