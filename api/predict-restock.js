'use strict';
const { getNormalizedDeliveries } = require('./_lib/orders');
const { stapleProducts } = require('./_lib/analyze');
const { picnicRequest } = require('./_lib/picnic');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method Not Allowed' }); return; }

  const auth = req.query.auth;
  if (!auth) { res.status(400).json({ error: 'auth ontbreekt' }); return; }

  try {
    const deliveries = await getNormalizedDeliveries(auth);
    const due = stapleProducts(deliveries, { minFraction: 0.7 });
    if (due.length === 0) { res.status(200).json({ added: [], skipped: [], productIds: [] }); return; }

    // Huidige mand ophalen om dubbel toevoegen te voorkomen.
    const cart = await picnicRequest({ method: 'GET', path: '/cart', auth });
    if (cart.status < 200 || cart.status >= 300) {
      res.status(502).json({ error: 'Mand ophalen mislukt' });
      return;
    }
    const inCart = new Set();
    for (const line of (cart.json?.items || [])) {
      const art = (line.items && line.items[0]) || {};
      const pid = (art.id || line.id || '').replace(/^s/, '');
      if (pid) inCart.add(pid);
    }

    const added = [], skipped = [], productIds = [];
    for (const p of due) {
      if (inCart.has(p.productId)) { skipped.push({ name: p.name, reason: 'al in mand' }); continue; }
      const qty = Math.max(1, p.usualQty);
      const r = await picnicRequest({
        method: 'POST', path: '/cart/add_product', auth,
        body: { product_id: `s${p.productId}`, count: qty },
      });
      if (r.status >= 200 && r.status < 300) {
        added.push({ name: p.name, count: qty });
        productIds.push(p.productId);
      } else {
        skipped.push({ name: p.name, reason: 'niet leverbaar' });
      }
    }
    res.status(200).json({ added, skipped, productIds });
  } catch (err) {
    if (err.status === 401 || err.status === 403) { res.status(401).json({ error: 'Sessie verlopen' }); return; }
    console.error('predict-restock error:', (err.message || '').slice(0, 200));
    res.status(500).json({ error: 'Aanvullen mislukt' });
  }
};
