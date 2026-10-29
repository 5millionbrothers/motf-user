const { json } = require("./_utils");
const { methods } = require("./_nicepay-runtime");
const { isConfigured } = require("./_nicepay");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, message: "GET 요청만 사용할 수 있습니다." });
  }
  res.setHeader("Cache-Control", "no-store");
  const stayClientKey = process.env.TOSS_STAY_CLIENT_KEY || process.env.TOSS_CLIENT_KEY || "";
  return json(res, 200, {
    ok: true,
    provider: process.env.PAYMENT_PROVIDER === "nicepay" ? "nicepay" : "toss",
    nicepayConfigured: {
      stay: isConfigured("stay"),
      market: isConfigured("market"),
    },
    nicepayMethods: { stay: methods("stay"), market: methods("market") },
    tossClientKey: stayClientKey,
    tossClientKeys: {
      stay: stayClientKey,
      market: process.env.TOSS_MARKET_CLIENT_KEY || "",
    },
    naverMapKeyId: process.env.NAVER_MAP_KEY_ID || "",
  });
};
