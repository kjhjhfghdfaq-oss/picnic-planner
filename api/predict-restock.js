'use strict';
const { getNormalizedDeliveries } = require('./_lib/orders');
const { stapleProducts } = require('./_lib/analyze');
const { picnicRequest } = require('./_lib/picnic');
const { searchTopProduct } = require('./_lib/search');

// Woord-gebaseerde naam-match: alle woorden van de kortste naam moeten in de langste
// voorkomen. Robuust tegen woordvolgorde en extra tekst ("6 x 1,5L"), zonder losse
// substring-valstrikken. Voorkomt dat de zoek-fallback een verkeerd product toevoegt.
function namesMatch(a, b) {
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const ta = norm(a), tb = norm(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longSet = new Set(long);
  return short.every(w => longSet.has(w));
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

    // Mand-respons → lijst van { name(lower), id(stripped) }.
    const cartEntries = (cart) => {
      const out = [];
      for (const line of (cart.json?.items || [])) {
        const art = (line.items && line.items[0]) || {};
        const pid = (art.id || line.id || '').replace(/^s/, '');
        const nm = (art.name || '').toLowerCase();
        if (nm) out.push({ name: nm, id: pid });
      }
      return out;
    };
    const getCart = async () => {
      const c = await picnicRequest({ method: 'GET', path: '/cart', auth });
      if (c.status < 200 || c.status >= 300) return null;
      return cartEntries(c);
    };
    const inCart = (entries, name) => entries.some(e => namesMatch(e.name, name));
    const idFor = (entries, name) => { const m = entries.find(e => namesMatch(e.name, name)); return m && m.id; };
    const addProduct = (id, count) => picnicRequest({
      method: 'POST', path: '/cart/add_product', auth,
      body: { product_id: id, count: Math.max(1, count) },
    });

    const before = await getCart();
    if (!before) { res.status(502).json({ error: 'Mand ophalen mislukt' }); return; }

    // Wat zit al in de mand (op naam) → overslaan.
    const alreadyInCart = [], toAdd = [];
    for (const s of staples) {
      if (inCart(before, s.name)) alreadyInCart.push(s.name);
      else toAdd.push(s);
    }

    // Voeg toe met het gebruikelijke aantal (usualQty = meest voorkomende aantal uit je historie).

    // Fase 1: meest recente SKU uit de historie.
    for (const s of toAdd) await addProduct(`s${s.productId}`, s.usualQty);
    let entries = (await getCart()) || before;

    // Fase 2: zoek-fallback voor wat nog niet in de mand staat (SKU gewijzigd/verdwenen).
    for (const s of toAdd) {
      if (inCart(entries, s.name)) continue;
      const hit = await searchTopProduct(auth, s.name);
      if (hit && namesMatch(hit.name, s.name)) await addProduct(hit.id, s.usualQty);
    }
    const finalEntries = (await getCart()) || entries;

    // Resultaat = wat er nu ÉCHT in de mand staat (op naam geverifieerd).
    const added = [], failed = [], productIds = [];
    for (const s of toAdd) {
      if (inCart(finalEntries, s.name)) {
        added.push({ name: s.name, count: Math.max(1, s.usualQty) });
        const id = idFor(finalEntries, s.name);
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
