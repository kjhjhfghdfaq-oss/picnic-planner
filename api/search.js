const https = require("https");

const AGENT = "30100;1.15.232-15154";
const UA = "okhttp/4.9.0";

function collectArticles(node, out) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) collectArticles(n, out); return; }
  if (node.id && (node.type === "SINGLE_ARTICLE" || node.type === "ARTICLE")) {
    out.push(node);
  }
  for (const k of Object.keys(node)) collectArticles(node[k], out);
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const { q, auth } = req.query;
  const options = {
    hostname: "storefront-prod.nl.picnicinternational.com",
    path: "/api/15/pages/search-page-results?search_term=" + encodeURIComponent(q || ""),
    method: "GET",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "User-Agent": UA,
      "x-client-version": "15.0",
      "x-picnic-agent": AGENT,
      "x-picnic-auth": auth || ""
    }
  };

  const data = await new Promise((resolve, reject) => {
    const r = https.request(options, resp => {
      let d = "";
      resp.on("data", c => d += c);
      resp.on("end", () => resolve({ status: resp.statusCode, body: d }));
    });
    r.on("error", reject);
    r.end();
  });

  let items = [];
  try {
    const parsed = JSON.parse(data.body);
    collectArticles(parsed, items);
  } catch (_) {}

  res.status(data.status).json({ status: data.status, items, raw: data.body });
};
