'use strict';
const https = require('https');

const PICNIC_HOST = 'storefront-prod.nl.picnicinternational.com';

function picnicHeaders(auth, extra = {}) {
  return {
    'Content-Type': 'application/json; charset=UTF-8',
    'User-Agent': 'okhttp/4.9.0',
    'x-client-version': '15.0',
    'x-picnic-agent': '30100;1.228.1-15480;',
    'x-picnic-did': '3C417201548B2E3B',
    'x-picnic-auth': auth || '',
    ...extra,
  };
}

// Doet een Picnic-call en parseert JSON. Geeft { status, json, raw }.
function picnicRequest({ method, path, auth, body }) {
  const payload = body ? JSON.stringify(body) : null;
  const headers = picnicHeaders(auth, payload ? { 'Content-Length': Buffer.byteLength(payload) } : {});
  const options = { hostname: PICNIC_HOST, path: `/api/15${path}`, method, headers };
  return new Promise((resolve, reject) => {
    const r = https.request(options, resp => {
      let d = '';
      resp.on('data', c => (d += c));
      resp.on('end', () => {
        let json = null;
        try { json = d ? JSON.parse(d) : null; } catch (_) { /* niet-JSON */ }
        resolve({ status: resp.statusCode, json, raw: d });
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

module.exports = { picnicRequest, picnicHeaders, PICNIC_HOST };
