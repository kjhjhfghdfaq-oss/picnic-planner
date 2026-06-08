'use strict';
const { picnicRequest } = require('./picnic');

// Plat de SELLING_UNIT_TILE-nodes uit een Picnic page-respons (zelfde shape als api/search.js).
function collectSellingUnits(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) collectSellingUnits(n, out); return; }
  if (node.type === 'SELLING_UNIT_TILE' && node.sellingUnit && node.sellingUnit.id) {
    out.push({ id: node.sellingUnit.id, name: node.sellingUnit.name });
    return;
  }
  for (const k of Object.keys(node)) collectSellingUnits(node[k], out);
}

// Zoekt een term en geeft het eerste (meest relevante) actuele product terug
// als { id, name } (id is s-prefixed, zoals add_product verwacht), of null.
async function searchTopProduct(auth, term) {
  const r = await picnicRequest({
    method: 'GET',
    path: `/pages/search-page-results?search_term=${encodeURIComponent(term || '')}`,
    auth,
  });
  if (!r.json) return null;
  const out = [];
  collectSellingUnits(r.json, out);
  return out.length ? { id: out[0].id, name: out[0].name || '' } : null;
}

module.exports = { searchTopProduct, collectSellingUnits };
