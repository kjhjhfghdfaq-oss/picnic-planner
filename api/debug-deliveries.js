'use strict';
// TIJDELIJK debug-endpoint — onderzoekt de echte vorm van de Picnic deliveries-response.
// Wordt verwijderd zodra de normalisatie in orders.js is afgestemd.
const { picnicRequest } = require('./_lib/picnic');

function snippet(raw, n = 4000) {
  return typeof raw === 'string' ? raw.slice(0, n) : raw;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  const auth = req.query.auth;
  if (!auth) { res.status(400).json({ error: 'auth ontbreekt' }); return; }

  const out = {};

  // Probeer de mogelijke list-endpoints/methodes.
  const probes = [
    ['POST /deliveries/summary []', { method: 'POST', path: '/deliveries/summary', auth, body: [] }],
    ['POST /deliveries []', { method: 'POST', path: '/deliveries', auth, body: [] }],
  ];

  let firstList = null;
  for (const [label, opts] of probes) {
    try {
      const r = await picnicRequest(opts);
      const isArray = Array.isArray(r.json);
      out[label] = {
        status: r.status,
        isArray,
        length: isArray ? r.json.length : undefined,
        // toon de keys van het eerste element zodat we de vorm zien
        firstKeys: isArray && r.json[0] ? Object.keys(r.json[0]) : undefined,
        sample: snippet(r.raw, 1500),
      };
      if (!firstList && isArray && r.json.length > 0) firstList = r.json;
    } catch (e) {
      out[label] = { error: String(e.message || e).slice(0, 200) };
    }
  }

  // Pak één leverings-id en haal het detail op, zodat we de regel-structuur zien.
  if (firstList) {
    const entry = firstList[0];
    const id = entry.delivery_id || entry.id;
    out._firstDeliveryId = id;
    if (id) {
      try {
        const d = await picnicRequest({ method: 'GET', path: `/deliveries/${id}`, auth });
        out._deliveryDetail = { status: d.status, topKeys: d.json ? Object.keys(d.json) : undefined, sample: snippet(d.raw, 4000) };
      } catch (e) {
        out._deliveryDetail = { error: String(e.message || e).slice(0, 200) };
      }
    }
  }

  res.status(200).json(out);
};
