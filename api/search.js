const https = require("https");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  const { q, auth } = req.query;
  const options = {
    hostname: "storefront-prod.nl.picnicinternational.com",
    path: "/api/15/search?search_term=" + encodeURIComponent(q || ""),
    method: "GET",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "x-client-version": "15.0",
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
  res.status(data.status).send(data.body);
};
