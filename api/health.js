const { json } = require("./_utils");
const { isConfigured } = require("./_nicepay");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, message: "GET 요청만 사용할 수 있습니다." });
  }

  return json(res, 200, {
    ok: true,
    service: "motf-prototype",
    paymentProvider: process.env.PAYMENT_PROVIDER === "nicepay" ? "nicepay" : "toss",
    nicepayPaymentConfigured: isConfigured("stay"),
    nicepayMarketPaymentConfigured: isConfigured("market"),
    automatedPayoutEnabled: false,
    paymentConfigured: Boolean(
      process.env.PAYMENT_PROVIDER === "nicepay" ? isConfigured("stay") :
      (process.env.TOSS_STAY_CLIENT_KEY || process.env.TOSS_CLIENT_KEY) &&
      (process.env.TOSS_STAY_SECRET_KEY || process.env.TOSS_SECRET_KEY),
    ),
    marketPaymentConfigured: Boolean(
      process.env.PAYMENT_PROVIDER === "nicepay" ? isConfigured("market") :
      process.env.TOSS_MARKET_CLIENT_KEY &&
      process.env.TOSS_MARKET_SECRET_KEY,
    ),
  });
};
