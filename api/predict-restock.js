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

    // Product-IDs uit een mand-respons halen (s-prefix gestript).
    const cartIds = (cart) => {
      const s = new Set();
      for (const line of (cart.json?.items || [])) {
        const art = (line.items && line.items[0]) || {};
        const pid = (art.id || line.id || '').replace(/^s/, '');
        if (pid) s.add(pid);
      }
      return s;
    };

    // Huidige mand ophalen om dubbel toevoegen te voorkomen.
    const cartBefore = await picnicRequest({ method: 'GET', path: '/cart', auth });
    if (cartBefore.status < 200 || cartBefore.status >= 300) {
      res.status(502).json({ error: 'Mand ophalen mislukt' });
      return;
    }
    const inCartBefore = cartIds(cartBefore);

    // Probeer alles toe te voegen wat nog niet in de mand zit.
    const alreadyInCart = [], attempts = [];
    for (const p of due) {
      if (inCartBefore.has(p.productId)) { alreadyInCart.push(p.name); continue; }
      const qty = Math.max(1, p.usualQty);
      await picnicRequest({
        method: 'POST', path: '/cart/add_product', auth,
        body: { product_id: `s${p.productId}`, count: qty },
      });
      attempts.push({ productId: p.productId, name: p.name, count: qty });
    }

    // VERIFIEER tegen de mand: een 2xx van add_product betekent niet altijd dat het product
    // echt is toegevoegd (bijv. verouderde SKU). Alleen wat nu echt in de mand staat telt.
    const added = [], failed = [], productIds = [];
    if (attempts.length) {
      const cartAfter = await picnicRequest({ method: 'GET', path: '/cart', auth });
      const verified = (cartAfter.status >= 200 && cartAfter.status < 300) ? cartIds(cartAfter) : null;
      for (const a of attempts) {
        if (!verified || verified.has(a.productId)) {
          // verified=null → mand-check zelf mislukt; dan poging vertrouwen (geen valse 'mislukt')
          added.push({ name: a.name, count: a.count });
          productIds.push(a.productId);
        } else {
          failed.push({ name: a.name });
        }
      }
    }
    res.status(200).json({ added, alreadyInCart, failed, productIds });
  } catch (err) {
    if (err.status === 401 || err.status === 403) { res.status(401).json({ error: 'Sessie verlopen' }); return; }
    console.error('predict-restock error:', (err.message || '').slice(0, 200));
    res.status(500).json({ error: 'Aanvullen mislukt' });
  }
};
