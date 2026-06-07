'use strict';
// TIJDELIJK debug-endpoint — zoekt uit welk artikel-endpoint de productcategorie geeft (voor de S5-meter).
// Wordt verwijderd zodra de S5-verrijking in orders.js is afgestemd.
const { picnicRequest } = require('./_lib/picnic');

function snippet(raw, n = 2500) {
  return typeof raw === 'string' ? raw.slice(0, n) : raw;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  const auth = req.query.auth;
  if (!auth) { res.status(400).json({ error: 'auth ontbreekt' }); return; }

  // Bekend product uit jouw historie: Picnic bloemkool (s1167116).
  const probes = [
    ['GET /articles/1167116/category', { method: 'GET', path: '/articles/1167116/category', auth }],
    ['GET /articles/s1167116/category', { method: 'GET', path: '/articles/s1167116/category', auth }],
    ['GET /articles/1167116', { method: 'GET', path: '/articles/1167116', auth }],
    ['GET /articles/s1167116', { method: 'GET', path: '/articles/s1167116', auth }],
    ['GET /my_store?depth=0', { method: 'GET', path: '/my_store?depth=0', auth }],
  ];

  const out = {};
  for (const [label, opts] of probes) {
    try {
      const r = await picnicRequest(opts);
      out[label] = {
        status: r.status,
        topKeys: r.json && typeof r.json === 'object' ? Object.keys(r.json).slice(0, 20) : undefined,
        sample: snippet(r.raw),
      };
    } catch (e) {
      out[label] = { error: String(e.message || e).slice(0, 200) };
    }
  }
  res.status(200).json(out);
};
