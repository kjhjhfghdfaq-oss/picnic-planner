const https = require("https");

const AGENT = "30100;1.15.232-15154";
const UA = "okhttp/4.9.0";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const { auth, code } = req.body || {};
  const isVerify = !!code;
  const path = isVerify ? "/api/15/user/2fa/verify" : "/api/15/user/2fa/generate";
  const body = JSON.stringify(isVerify ? { otp: String(code) } : { channel: "SMS" });

  const options = {
    hostname: "storefront-prod.nl.picnicinternational.com",
    path,
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Content-Length": Buffer.byteLength(body),
      "User-Agent": UA,
      "x-client-version": "15.0",
      "x-picnic-agent": AGENT,
      "x-picnic-auth": auth || ""
    }
  };

  try {
    const data = await new Promise((resolve, reject) => {
      const r = https.request(options, resp => {
        const newAuth = resp.headers["x-picnic-auth"] || null;
        let d = "";
        resp.on("data", c => d += c);
        resp.on("end", () => resolve({ status: resp.statusCode, body: d, auth: newAuth }));
      });
      r.on("error", reject);
      r.write(body);
      r.end();
    });
    res.status(200).json({ status: data.status, body: data.body, auth: data.auth });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
