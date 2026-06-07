'use strict';
const { kv } = require('@vercel/kv');
const { picnicRequest } = require('./picnic');

// Haalt afgeronde leveringen op, cachet onveranderlijke leveringen in KV,
// verrijkt elke regel met de Picnic-categorie en geeft de genormaliseerde set terug.
async function getNormalizedDeliveries(auth) {
  // 1. Samenvatting van leveringen ophalen (lijst met ids + datums).
  const summary = await picnicRequest({ method: 'POST', path: '/deliveries/summary', auth, body: {} });
  if (summary.status === 401 || summary.status === 403) {
    const err = new Error('unauthorized');
    err.status = summary.status;
    throw err;
  }
  const list = Array.isArray(summary.json) ? summary.json : (summary.json?.deliveries || []);

  const deliveries = [];
  for (const entry of list) {
    const id = entry.delivery_id || entry.id;
    if (!id) continue;

    // 2. Cache check (afgeronde leveringen veranderen nooit).
    let cached = null;
    try { cached = await kv.get(`delivery:${id}`); } catch (_) {}
    if (cached) { deliveries.push(cached); continue; }

    // 3. Detail ophalen.
    const detail = await picnicRequest({ method: 'GET', path: `/deliveries/${id}`, auth });
    if (detail.status < 200 || detail.status >= 300 || !detail.json) continue;

    const normalized = await normalizeDelivery(detail.json, auth);
    if (!normalized) continue;

    // alleen afgeronde leveringen cachen
    if (isCompleted(detail.json)) {
      try { await kv.set(`delivery:${id}`, normalized); } catch (_) {}
    }
    deliveries.push(normalized);
  }
  return deliveries;
}

function isCompleted(raw) {
  const status = (raw.status || raw.delivery_status || '').toString().toUpperCase();
  if (status === 'COMPLETED') return true;
  if (status === 'CURRENT') return false;
  return true; // onbekende status: neem aan voltooid en cache
}

// Zet een Picnic-leveringsobject om naar de interne Delivery-vorm.
// VERIFIEER LIVE: de exacte velden (orders[].items[].items[] shape) kunnen afwijken.
async function normalizeDelivery(raw, auth) {
  const id = raw.delivery_id || raw.id;
  const date = raw.creation_time || raw.delivery_time?.start || raw.eta2?.start || new Date().toISOString();

  const descriptors = [];
  for (const order of (raw.orders || [])) {
    for (const orderLine of (order.items || [])) {
      const articles = orderLine.items || [orderLine];
      const first = articles[0] || {};
      const productId = (first.id || orderLine.id || '').replace(/^s/, '');
      if (!productId) continue;
      descriptors.push({
        productId,
        name: first.name || orderLine.name || productId,
        count: articles.length || orderLine.decorators?.length || 1,
        priceCents: orderLine.price || first.price || 0,
        first,
      });
    }
  }

  const lines = await Promise.all(descriptors.map(async d => ({
    productId: d.productId,
    name: d.name,
    count: d.count,
    priceCents: d.priceCents,
    category: await categoryFor(d.productId, d.first, auth),
  })));

  const totalCents = raw.total_price || lines.reduce((s, l) => s + l.priceCents, 0);
  return { id, date, totalCents, items: lines };
}

// Categorie per product, gecachet. Eerst proberen uit de regel-data, anders ophalen.
async function categoryFor(productId, article, auth) {
  if (article && article.category_name) return article.category_name;
  if (!productId) return '';
  const key = `product-s5:${productId}`;
  try {
    const hit = await kv.get(key);
    if (hit) return hit;
  } catch (_) {}
  try {
    const resp = await picnicRequest({ method: 'GET', path: `/articles/${productId}/category`, auth });
    const cat = resp.json?.name || resp.json?.category_name || '';
    if (cat) { try { await kv.set(key, cat); } catch (_) {} }
    return cat;
  } catch (_) {
    return '';
  }
}

module.exports = { getNormalizedDeliveries };
