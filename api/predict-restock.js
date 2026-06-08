'use strict';
const { getNormalizedDeliveries } = require('./_lib/orders');
const { stapleProducts } = require('./_lib/analyze');
const { picnicRequest } = require('./_lib/picnic');
const { searchTopProduct } = require('./_lib/search');

// Losse naam-match: voorkomt dat de zoek-fallback een verkeerd product toevoegt.
function namesMatch(a, b) {
  const x = String(a || '').toLowerCase().trim();
  const y = String(b || '').toLowerCase().trim();
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
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
    const deliveries = await getNormalizedDeliveries(auth);
    const staples = stapleProducts(deliveries, { minFraction: 0.7 });
    if (staples.length === 0) { res.status(200).json({ added: [], alreadyInCart: [], failed: [], productIds: [] }); return; }

    // Index van een mand-respons: namen (lowercase) + stripped productId per naam.
    const cartIndex = (cart) => {
      const names = new Set(); const idByName = new Map();
      for (const line of (cart.json?.items || [])) {
        const art = (line.items && line.items[0]) || {};
        const pid = (art.id || line.id || '').replace(/^s/, '');
        const nm = (art.name || '').toLowerCase();
        if (nm) { names.add(nm); if (pid) idByName.set(nm, pid); }
      }
      return { names, idByName };
    };
    const getCartIndex = async () => {
      const c = await picnicRequest({ method: 'GET', path: '/cart', auth });
      if (c.status < 200 || c.status >= 300) return null;
      return cartIndex(c);
    };
    const addProduct = (id, count) => picnicRequest({
      method: 'POST', path: '/cart/add_product', auth,
      body: { product_id: id, count: Math.max(1, count) },
    });

    const before = await getCartIndex();
    if (!before) { res.status(502).json({ error: 'Mand ophalen mislukt' }); return; }

    // Wat zit al in de mand (op naam) → overslaan.
    const alreadyInCart = [], toAdd = [];
    for (const s of staples) {
      if (before.names.has(s.name.toLowerCase())) alreadyInCart.push(s.name);
      else toAdd.push(s);
    }

    // Fase 1: meest recente SKU uit de historie.
    for (const s of toAdd) await addProduct(`s${s.productId}`, s.usualQty);
    let idx = (await getCartIndex()) || before;

    // Fase 2: zoek-fallback voor wat nog niet in de mand staat (SKU gewijzigd/verdwenen).
    for (const s of toAdd) {
      if (idx.names.has(s.name.toLowerCase())) continue;
      const hit = await searchTopProduct(auth, s.name);
      if (hit && namesMatch(hit.name, s.name)) await addProduct(hit.id, s.usualQty);
    }
    const finalIdx = (await getCartIndex()) || idx;

    // Resultaat = wat er nu ÉCHT in de mand staat (op naam geverifieerd).
    const added = [], failed = [], productIds = [];
    for (const s of toAdd) {
      const nm = s.name.toLowerCase();
      if (finalIdx.names.has(nm)) {
        added.push({ name: s.name, count: Math.max(1, s.usualQty) });
        const id = finalIdx.idByName.get(nm);
        if (id) productIds.push(id);
      } else {
        failed.push({ name: s.name });
      }
    }
    res.status(200).json({ added, alreadyInCart, failed, productIds });
  } catch (err) {
    if (err.status === 401 || err.status === 403) { res.status(401).json({ error: 'Sessie verlopen' }); return; }
    console.error('predict-restock error:', (err.message || '').slice(0, 200));
    res.status(500).json({ error: 'Aanvullen mislukt' });
  }
};
