const { json, requireEnv, authenticatedUser, supabaseRequest: db, tossRequest, requireTossSecret } = require("./_server");
const rt = require("./_nicepay-runtime");
const pg = require("./_nicepay");
const refund = require("./refund-payment");
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return json(res, 405, { ok: false });
  try {
    requireEnv(["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
    const user = await authenticatedUser(req.headers.authorization || "");
    if (!user?.id || (await rt.profile(user.id)).role !== "admin") throw rt.error("FORBIDDEN", "운영자 권한이 필요합니다.", 403);
    const input = await rt.body(req);
    let intent = await rt.intentByOrder(input.orderId);
    const ops = await db(`/rest/v1/payment_provider_operations?payment_intent_id=eq.${intent.id}&operation_kind=eq.refund&select=*&limit=1`);
    const pending = ops?.[0];
    if (intent.provider === "nicepay") {
      const checked = await rt.queryPayment(intent);
      if (pending && ["processing", "unknown"].includes(pending.state)) {
        const percent = pending.context?.percent;
        let cancellation;
        try { cancellation = pg.verifyCancellation(intent.refund_response || {}, { fields: { CancelAmt: String(pending.amount), Moid: `refund-${intent.id}` } }, pg.merchantConfig(intent.kind)); }
        catch { throw rt.error("REFUND_REVIEW_REQUIRED", "취소 금액을 증명하는 응답이 없습니다. 나이스 관리자에서 금액을 확인해주세요. 자동 재환불하지 않습니다."); }
        if (!Number.isInteger(percent) || (percent === 100 && checked.Status !== "1") || (percent < 100 && cancellation.status !== "cancelled")) throw rt.error("REFUND_REVIEW_REQUIRED", "환불 최종 상태를 나이스 관리자에서 확인해주세요. 자동 재환불하지 않습니다.");
        await refund.record(intent, percent, intent.refund_reason || "운영팀 환불 대사", "refunded", intent.refund_response, pending.context.requestedStatus);
        await rt.operationState(pending.id, "succeeded", intent.payment_key);
      } else if (checked.Status === "0" && ["prepared", "ready", "in_progress", "virtual_account_issued", "waiting_for_deposit"].includes(intent.status)) {
        const approvals = await db(`/rest/v1/payment_provider_operations?payment_intent_id=eq.${intent.id}&operation_kind=eq.approve&select=id,state&limit=1`);
        if (!approvals?.[0] || ["submitting", "cancelled", "failed"].includes(approvals[0].state)) throw rt.error("APPROVAL_NOT_READY", "진행 중인 승인 또는 망취소 상태를 먼저 확인해주세요.");
        await rt.finalize(intent, intent.payment_response || {});
        await rt.operationState(approvals[0].id, "succeeded", intent.payment_key);
      } else if (checked.Status === "1" && intent.status !== "confirmed") {
        await db(`/rest/v1/payment_intents?id=eq.${intent.id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) });
        await db("/rest/v1/rpc/release_expired_checkout_intents", { method: "POST", body: "{}" });
      } else if (checked.Status === "1" && intent.status === "confirmed") {
        throw rt.error("EXTERNAL_CANCEL_REVIEW_REQUIRED", "나이스에서 취소된 거래입니다. 취소 금액과 사유를 확인한 뒤 예약·환불 원장을 대사해야 합니다.");
      }
    } else if (intent.provider === "toss" && intent.status !== "confirmed") {
      const payment = await tossRequest(`/v1/payments/orders/${encodeURIComponent(intent.order_id)}`, {}, requireTossSecret(intent.kind));
      if (payment.orderId !== intent.order_id || Number(payment.totalAmount) !== Number(intent.amount) || payment.status !== "DONE") throw rt.error("PAYMENT_NOT_DONE", "완료된 원결제와 주문이 일치하지 않습니다.");
      await db("/rest/v1/rpc/finalize_toss_payment_intent", { method: "POST", body: JSON.stringify({ target_customer_id: intent.customer_id, target_order_id: intent.order_id, target_payment_key: payment.paymentKey, toss_payment: payment }) });
    } else if (intent.provider !== "toss") throw rt.error("UNSUPPORTED_PROVIDER", "운영팀 수동 확인이 필요한 과거 거래입니다.");
    intent = await rt.intentByOrder(input.orderId);
    const result = rt.publicResult(intent);
    return json(res, 200, { ...result, message: result.status === "paid" ? "결제를 확인하고 예약·주문 내역을 연결했습니다." : `확인된 결제 상태: ${result.status}` });
  } catch (error) {
    console.error("reconcile-payment", error.code || "RECONCILE_ERROR");
    return json(res, error.statusCode || 502, { ok: false, message: error.message || "결제 대사를 완료하지 못했습니다." });
  }
};
