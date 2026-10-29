const { json } = require("./_utils");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { ok: false, message: "GET 요청만 사용할 수 있습니다." });
  }

  return json(res, 200, {
    ok: true,
    service: "motf-prototype",
    paymentProvider: process.env.PAYMENT_PROVIDER === "nicepay" ? "nicepay" : "toss",
    nicepayPaymentConfigured: Boolean(process.env.NICEPAY_STAY_MID && process.env.NICEPAY_STAY_MERCHANT_KEY),
    nicepayMarketPaymentConfigured: Boolean(process.env.NICEPAY_MARKET_MID && process.env.NICEPAY_MARKET_MERCHANT_KEY),
    automatedPayoutEnabled: false,
    paymentConfigured: Boolean(
      process.env.PAYMENT_PROVIDER === "nicepay" ? process.env.NICEPAY_STAY_MID && process.env.NICEPAY_STAY_MERCHANT_KEY :
      (process.env.TOSS_STAY_CLIENT_KEY || process.env.TOSS_CLIENT_KEY) &&
      (process.env.TOSS_STAY_SECRET_KEY || process.env.TOSS_SECRET_KEY),
    ),
    marketPaymentConfigured: Boolean(
      process.env.PAYMENT_PROVIDER === "nicepay" ? process.env.NICEPAY_MARKET_MID && process.env.NICEPAY_MARKET_MERCHANT_KEY :
      process.env.TOSS_MARKET_CLIENT_KEY &&
      process.env.TOSS_MARKET_SECRET_KEY,
    ),
  });
};
