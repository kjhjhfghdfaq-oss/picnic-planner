const https = require("https");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  const { auth } = req.query;
  const body = JSON.stringify(req.body || {});
  const options = {
    hostname: "storefront-prod.nl.picnicinternational.com",
    path: "/api/15/cart/add_product",
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "x-client-version": "15.0",
      "x-picnic-auth": auth || "",
      "Content-Length": Buffer.byteLength(body)
    }
  };
  const data = await new Promise((resolve, reject) => {
    const r = https.request(options, resp => {
      let d = "";
      resp.on("data", c => d += c);
      resp.on("end", () => resolve({ status: resp.statusCode, body: d }));
    });
    r.on("error", reject);
    r.write(body);
    r.end();
  });
  res.status(data.status).send(data.body);
};
