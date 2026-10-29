const { json, env, requireEnv, authenticatedUser, supabaseRequest: db, requireTossSecret, tossRequest } = require("./_server");
const pg = require("./_nicepay");
const rt = require("./_nicepay-runtime");

function refundPercent(transaction, kind, now = new Date()) {
  if (transaction.status === "pending") return 100;
  if (kind === "market") throw rt.error("CONTACT_SELLER", "확정된 상품 주문 취소는 판매자에게 문의해주세요.");
  const today = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const day = String(transaction.check_in_date || transaction.event_date || "").slice(0, 10);
  const days = (Date.parse(day + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000;
  if (!Number.isFinite(days)) throw rt.error("INVALID_BOOKING_DATE", "예약 날짜를 확인해주세요.");
  const fallback = [{ days_before: 14, refund_percent: 100 }, { days_before: 7, refund_percent: 50 }, { days_before: 3, refund_percent: 20 }];
  const policy = Array.isArray(transaction.businesses?.refund_policy) && transaction.businesses.refund_policy.length ? transaction.businesses.refund_policy : fallback;
  const value = Number([...policy].sort((a, b) => Number(b.days_before) - Number(a.days_before)).find(row => days >= Number(row.days_before))?.refund_percent || 0);
  if (!Number.isInteger(value) || value < 0 || value > 100) throw rt.error("INVALID_REFUND_POLICY", "환불 규정을 확인해주세요.");
  return value;
}
async function record(intent, percent, reason, state, response, requestedStatus) {
  return db("/rest/v1/rpc/record_provider_refund", { method: "POST", body: JSON.stringify({ target_provider: intent.provider, target_transaction_kind: intent.kind, target_transaction_id: intent.transaction_id, external_refund_amount: Math.floor(intent.amount * percent / 100), points_refund_amount: Math.floor(Number(intent.points_used || 0) * percent / 100), refund_percent: percent, refund_reason: reason, refund_state: state, provider_response: response, requested_transaction_status: requestedStatus }) });
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return json(res, 405, { ok: false });
  let claimedOperation = null; let submitted = false;
  try {
    requireEnv(["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
    const authorization = req.headers.authorization || "";
    const user = await authenticatedUser(authorization);
    if (!user?.id) throw rt.error("LOGIN_REQUIRED", "로그인이 필요합니다.", 401);
    const actor = await rt.profile(user.id);
    const input = await rt.body(req);
    const kind = input.kind; const id = String(input.id || "");
    const action = input.action || "user_cancel";
    if (!["stay", "market"].includes(kind) || !/^[a-f\d-]{36}$/i.test(id) || !["user_cancel", "reject", "cancel"].includes(action)) throw rt.error("INVALID_REQUEST", "취소 요청 정보를 확인해주세요.", 400);
    const table = kind === "stay" ? "reservations" : "market_orders";
    const rows = await db(`/rest/v1/${table}?id=eq.${id}&select=*,businesses(refund_policy)&limit=1`);
    const transaction = rows?.[0];
    if (!transaction) throw rt.error("NOT_FOUND", "거래를 찾을 수 없습니다.", 404);
    if (action === "user_cancel") {
      const allowed = transaction.organization_id
        ? await db("/rest/v1/rpc/is_organization_member", { method: "POST", body: JSON.stringify({ target_id: transaction.organization_id, target_user: user.id }) })
        : transaction.customer_id === user.id;
      if (allowed !== true) throw rt.error("FORBIDDEN", "거래를 찾을 수 없습니다.", 404);
    } else if (actor.role !== "admin") {
      if (action === "cancel") throw rt.error("FORBIDDEN", "운영자 권한이 필요합니다.", 403);
      const allowed = await db("/rest/v1/rpc/has_business_permission", { method: "POST", headers: { Authorization: authorization }, body: JSON.stringify({ target_business_id: transaction.business_id, permission: "reservations" }) }, env("SUPABASE_PUBLISHABLE_KEY"));
      if (allowed !== true) throw rt.error("FORBIDDEN", "예약 관리 권한이 필요합니다.", 403);
    }
    if (!["pending", "confirmed"].includes(transaction.status)) throw rt.error("TRANSACTION_CLOSED", "이미 종료된 거래입니다.");
    const intents = await db(`/rest/v1/payment_intents?kind=eq.${kind}&transaction_id=eq.${id}&select=*&limit=1`);
    const intent = intents?.[0];
    if (!intent && action !== "user_cancel") {
      await db(`/rest/v1/rpc/${kind === "stay" ? "set_reservation_status" : "set_market_order_status"}`, { method: "POST", headers: { Authorization: authorization }, body: JSON.stringify({ [kind === "stay" ? "target_reservation_id" : "target_order_id"]: id, new_status: action === "reject" ? "rejected" : "cancelled", reason: String(input.reason || "운영팀 취소").slice(0, 200) }) }, env("SUPABASE_PUBLISHABLE_KEY"));
      return json(res, 200, { ok: true, refundStatus: "none", message: "연결된 확정 결제 없이 등록된 거래를 취소했습니다. 수동 수납금은 별도 확인해주세요." });
    }
    if (!intent || !["toss", "nicepay"].includes(intent.provider) || !intent.payment_key) throw rt.error("MANUAL_REVIEW_REQUIRED", "자동 환불할 원결제 내역이 없습니다. 운영팀 확인이 필요합니다.");
    if (intent.status !== "confirmed") throw rt.error("PAYMENT_ALREADY_PROCESSED", "이미 취소 처리된 결제입니다. 원장을 확인해주세요.");
    const percent = action === "user_cancel" ? refundPercent(transaction, kind) : 100;
    const requestedStatus = action === "reject" ? "rejected" : "cancelled";
    const reason = rt.truncateEuc(String(input.reason || (action === "reject" ? "판매자 예약 취소" : "예약 취소")), 100);
    const cash = Math.floor(intent.amount * percent / 100);
    if (!cash) {
      await record(intent, percent, reason, "refunded", { status: "NO_EXTERNAL_REFUND" }, requestedStatus);
      return json(res, 200, { ok: true, refundStatus: "refunded", message: "예약이 취소되었습니다. 취소 규정상 환불 금액은 없습니다." });
    }
    let request;
    if (intent.provider === "nicepay") {
      if (percent < 100 && env("NICEPAY_PARTIAL_CANCEL_ENABLED") !== "true") throw rt.error("PARTIAL_CANCEL_NOT_ENABLED", "부분 환불은 운영팀에 문의해주세요.");
      const config = pg.merchantConfig(kind);
      request = pg.cancelFields({ provider: "nicepay", mid: intent.provider_merchant_id, tid: intent.payment_key, method: intent.payment_method, status: "paid", originalAmount: intent.amount, remainingAmount: intent.amount }, config, { cancelAmount: cash, cancellationId: `refund-${intent.id}`, reason, refundAccount: input.refundAccount });
    } else requireTossSecret(kind);
    const op = await rt.operation(intent, "refund", `refund-${intent.id}`, cash, pg.sha256(JSON.stringify({ percent, cash, requestedStatus })));
    if (!op.claimed) return json(res, 409, { ok: false, refundStatus: op.operation_state, message: "이미 취소 요청이 있습니다. 중복 환불하지 않고 기존 요청을 확인합니다." });
    claimedOperation = op.operation_id;
    await db(`/rest/v1/payment_provider_operations?id=eq.${op.operation_id}`, { method: "PATCH", body: JSON.stringify({ context: { percent, requestedStatus, actorId: user.id, action } }) });
    await record(intent, percent, reason, "processing", {}, null);
    submitted = true;
    let result; let refundState = "refunded";
    if (intent.provider === "nicepay") {
      result = await rt.nicePost(request);
      const checked = pg.verifyCancellation(result, request, pg.merchantConfig(kind));
      refundState = checked.status === "processing" ? "processing" : "refunded";
      result = rt.receipt(result);
    } else {
      const payment = await tossRequest(`/v1/payments/${encodeURIComponent(intent.payment_key)}`, {}, requireTossSecret(kind));
      if (payment.orderId !== intent.order_id || Number(payment.totalAmount) !== Number(intent.amount)) throw rt.error("PAYMENT_MISMATCH", "원결제 내역이 일치하지 않습니다.");
      result = await tossRequest(`/v1/payments/${encodeURIComponent(intent.payment_key)}/cancel`, { method: "POST", headers: { "Idempotency-Key": `motf-refund-${intent.id}` }, body: JSON.stringify({ cancelReason: reason, cancelAmount: cash, ...(input.refundAccount ? { refundReceiveAccount: { bank: input.refundAccount.bankCode, accountNumber: input.refundAccount.accountNumber, holderName: input.refundAccount.holderName } } : {}) }) }, requireTossSecret(kind));
    }
    await db(`/rest/v1/payment_intents?id=eq.${intent.id}`, { method: "PATCH", body: JSON.stringify({ refund_response: result }) });
    await record(intent, percent, reason, refundState, result, requestedStatus);
    await rt.operationState(op.operation_id, refundState === "refunded" ? "succeeded" : "processing", intent.payment_key, result.ResultCode);
    return json(res, refundState === "refunded" ? 200 : 202, { ok: true, action, refundStatus: refundState, refundPercent: percent, cashRefundAmount: cash, pointRefundAmount: refundState === "refunded" ? Math.floor(Number(intent.points_used || 0) * percent / 100) : 0, message: refundState === "refunded" ? "취소 처리가 완료되었습니다. 환불 반영 시점은 결제수단에 따라 다를 수 있습니다." : "환불이 접수되어 처리 중입니다. 완료 확인 후 예약 상태와 포인트에 반영됩니다." });
  } catch (error) {
    if (claimedOperation) await rt.operationState(claimedOperation, submitted ? "unknown" : "failed").catch(() => {});
    console.error("refund-payment", error.code || "REFUND_ERROR");
    return json(res, error.statusCode || 502, { ok: false, code: error.code || "REFUND_ERROR", message: submitted ? "환불 결과 확인이 필요합니다. 중복 요청하지 말고 운영팀에 문의해주세요." : error.message || "취소 요청을 처리하지 못했습니다." });
  }
};
module.exports.refundPercent = refundPercent;
module.exports.record = record;
