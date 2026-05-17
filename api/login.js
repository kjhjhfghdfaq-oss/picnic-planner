const https = require("https");
const crypto = require("crypto");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  const { key, secret_plain } = req.body || {};
  const secret = crypto.createHash("md5").update(secret_plain || "").digest("hex");
  const body = JSON.stringify({ key, secret, client_id: "30100", device_id: "picnic-planner-web" });
  const options = {
    hostname: "storefront-prod.nl.picnicinternational.com",
    path: "/api/15/user/login",
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "x-client-version": "15.0",
      "Content-Length": Buffer.byteLength(body)
    }
  };
  try {
    const result = await new Promise((resolve, reject) => {
      const r = https.request(options, resp => {
        const auth = resp.headers["x-picnic-auth"] || null;
        let d = "";
        resp.on("data", c => d += c);
        resp.on("end", () => resolve({ status: resp.statusCode, auth, body: d }));
      });
      r.on("error", reject);
      r.write(body);
      r.end();
    });
    res.status(200).json({ auth: result.auth, status: result.status, debug: result.body });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};

