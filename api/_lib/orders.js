'use strict';
const { kv } = require('@vercel/kv');
const { picnicRequest } = require('./picnic');

// Hoeveel recente leveringen we in detail ophalen (cap tegen Vercel-timeout).
// Afgeronde leveringen worden gecachet, dus dit kost alleen de eerste keer iets.
const MAX_DETAIL = 24;
const BATCH = 8;
const BATCH_ALL = 12;

// Haalt de recente leveringen op, cachet onveranderlijke (afgeronde) leveringen in KV,
// en geeft de genormaliseerde set terug. Detailcalls draaien parallel in batches.
async function getNormalizedDeliveries(auth) {
  const summary = await picnicRequest({ method: 'POST', path: '/deliveries/summary', auth, body: [] });
  if (summary.status === 401 || summary.status === 403) {
    const err = new Error('unauthorized');
    err.status = summary.status;
    throw err;
  }
  const list = Array.isArray(summary.json) ? summary.json : [];
  const recent = list.slice(0, MAX_DETAIL); // summary is nieuwste-eerst

  const deliveries = [];
  for (let i = 0; i < recent.length; i += BATCH) {
    const chunk = recent.slice(i, i + BATCH);
    const settled = await Promise.all(chunk.map(entry => loadOne(entry, auth)));
    deliveries.push(...settled.filter(Boolean));
  }
  return deliveries;
}

// Haalt ALLE leveringen op (geen cap), detail parallel in batches van 12, cache-first.
// Gebruikt voor het dashboard; predict-restock gebruikt nog getNormalizedDeliveries.
async function getAllDeliveries(auth) {
  const summary = await picnicRequest({ method: 'POST', path: '/deliveries/summary', auth, body: [] });
  if (summary.status === 401 || summary.status === 403) {
    const err = new Error('unauthorized');
    err.status = summary.status;
    throw err;
  }
  const list = Array.isArray(summary.json) ? summary.json : [];

  const deliveries = [];
  for (let i = 0; i < list.length; i += BATCH_ALL) {
    const chunk = list.slice(i, i + BATCH_ALL);
    const settled = await Promise.all(chunk.map(entry => loadOne(entry, auth)));
    deliveries.push(...settled.filter(Boolean));
  }
  return deliveries;
}

async function loadOne(entry, auth) {
  const id = entry.delivery_id;
  if (!id) return null;

  // Afgeronde leveringen veranderen nooit — uit cache als beschikbaar.
  try {
    const cached = await kv.get(`delivery:${id}`);
    if (cached) return cached;
  } catch (_) {}

  const detail = await picnicRequest({ method: 'GET', path: `/deliveries/${id}`, auth });
  if (detail.status < 200 || detail.status >= 300 || !detail.json) return null;

  const normalized = normalizeDelivery(detail.json, entry);
  if (!normalized) return null;

  if ((entry.status || '').toUpperCase() === 'COMPLETED') {
    try { await kv.set(`delivery:${id}`, normalized); } catch (_) {}
  }
  return normalized;
}

// Zet een Picnic-leveringsdetail + bijbehorende summary-entry om naar de interne Delivery-vorm.
// Vorm bevestigd live (7 juni 2026): orders[].items[] = ORDER_LINE, line.items[] = ORDER_ARTICLE.
function normalizeDelivery(detail, summaryEntry) {
  const id = detail.delivery_id || detail.id;
  if (!id) return null;
  const date = detail.creation_time || (summaryEntry && summaryEntry.creation_time)
    || (detail.delivery_time && detail.delivery_time.start) || '';

  const items = [];
  for (const order of (detail.orders || [])) {
    for (const line of (order.items || [])) {            // ORDER_LINE
      const articles = line.items || [];                 // ORDER_ARTICLE[]
      const art = articles[0];
      if (!art || !art.id) continue;
      const productId = String(art.id).replace(/^s/, '');
      const qtyDecorator = (art.decorators || []).find(d => d && d.type === 'QUANTITY');
      const count = (qtyDecorator && qtyDecorator.quantity) || articles.length || 1;
      const priceCents = (line.display_price != null ? line.display_price : line.price) || 0;
      const name = art.name || productId;
      // category komt (nog) niet uit de leveringsdata; S5-verrijking volgt apart.
      // brand: heuristisch op basis van productnaam (expliciet gelabeld als afgeleid).
      const brand = /^picnic\b/i.test(name) ? 'huismerk' : 'amerk';
      items.push({ productId, name, count, priceCents, category: '', brand });
    }
  }

  // Totaal: autoritatief uit de summary order-totalen; anders som van regelprijzen.
  const summaryTotal = ((summaryEntry && summaryEntry.orders) || [])
    .reduce((s, o) => s + (o.total_price || 0), 0);
  const totalCents = summaryTotal || items.reduce((s, l) => s + l.priceCents, 0);

  const parcels = Array.isArray(detail.parcels) ? detail.parcels.length : 0;

  return { id, date, totalCents, parcels, items };
}

module.exports = { getNormalizedDeliveries, getAllDeliveries };
