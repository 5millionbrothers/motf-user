const { requireEnv, supabaseRequest: db } = require("./_server");
const runtime = require("./_nicepay-runtime");
module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.statusCode = 405; return res.end("FAIL"); }
  try {
    requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    const input = await runtime.body(req);
    const intent = await runtime.intentByOrder(input.MOID || input.Moid);
    // A webhook cannot supply a new TID. The authenticated callback must bind it first.
    if (intent.provider !== "nicepay" || intent.provider_merchant_id !== input.MID || intent.payment_key !== input.TID || Number(input.Amt) !== Number(intent.amount)) throw runtime.error("WEBHOOK_MISMATCH", "원장 불일치");
    const ops = await db(`/rest/v1/payment_provider_operations?payment_intent_id=eq.${intent.id}&operation_kind=eq.approve&select=state&limit=1`);
    if (ops?.[0]?.state !== "succeeded" && !(ops?.[0]?.state === "cancelled" && intent.provider_status === "NET_CANCELLED")) throw runtime.error("APPROVAL_UNRESOLVED", "승인 상태 확인 필요");
    const verified = await runtime.queryPayment(intent);
    if (verified.Status === "0" && intent.status !== "confirmed") {
      const recordedRefund = ["cancelled", "partial_cancelled"].includes(intent.status) && intent.refund_status === "refunded";
      if (!recordedRefund) await runtime.finalize(intent, intent.payment_response || {});
    }
    if (verified.Status === "1" && intent.status === "confirmed") throw runtime.error("EXTERNAL_CANCEL_REVIEW_REQUIRED", "환불 원장 대사 필요");
    if (verified.Status === "9" && !["virtual_account_issued", "waiting_for_deposit"].includes(intent.status)) throw runtime.error("PAYMENT_NOT_FOUND", "거래 조회 확인 필요");
    // Cancellation notifications alone cannot authorize point restoration or release inventory.
    // Known local refunds are reconciled through the refund operation ledger by the admin API.
    res.statusCode = 200; return res.end("OK");
  } catch (error) {
    console.error("nicepay-webhook", error.code || "WEBHOOK_ERROR");
    res.statusCode = 503; return res.end("FAIL");
  }
};
