const https = require("https");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  const { auth, code } = req.body || {};
  const path = code
    ? `/api/15/user/2fa/verify?otp=${code}`
    : "/api/15/user/2fa/generate?channel=SMS";
  const options = {
    hostname: "storefront-prod.nl.picnicinternational.com",
    path,
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "x-client-version": "15.0",
      "x-picnic-auth": auth || "",
      "Content-Length": "0"
    }
  };
  const data = await new Promise((resolve, reject) => {
    const r = https.request(options, resp => {
      const newAuth = resp.headers["x-picnic-auth"] || null;
      let d = "";
      resp.on("data", c => d += c);
      resp.on("end", () => resolve({ status: resp.statusCode, body: d, auth: newAuth }));
    });
    r.on("error", reject);
    r.end();
  });
  res.status(200).json({ status: data.status, body: data.body, auth: data.auth });
};
