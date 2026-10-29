const { requireEnv, supabaseRequest: db } = require("./_server");
const pg = require("./_nicepay");
const runtime = require("./_nicepay-runtime");
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.method !== "POST") { res.statusCode = 405; return res.end(); }
  let orderId = "";
  try {
    requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    const input = await runtime.body(req);
    const intent = await runtime.intentByOrder(input.Moid);
    orderId = intent.order_id;
    const sessions = await db(`/rest/v1/nicepay_checkout_sessions?payment_intent_id=eq.${intent.id}&select=nonce_hash,expires_at&limit=1`);
    const session = sessions?.[0];
    if (intent.provider !== "nicepay" || !session || !pg.verifyHash(pg.sha256(String(input.ReqReserved || "")), session.nonce_hash)) throw runtime.error("INVALID_SESSION", "결제 요청 정보를 확인할 수 없습니다.");
    if (intent.status === "confirmed" || intent.status === "virtual_account_issued") return redirect(res, orderId);
    if (new Date(session.expires_at).getTime() <= Date.now()) throw runtime.error("SESSION_EXPIRED", "결제 준비 시간이 만료되었습니다.");
    const config = pg.merchantConfig(intent.kind);
    if (config.mid !== intent.provider_merchant_id || input.PayMethod !== intent.payment_method) throw runtime.error("MERCHANT_MISMATCH", "결제 가맹점 또는 수단이 일치하지 않습니다.");
    pg.verifyAuthentication(input, intent, config);
    const op = await runtime.operation(intent, "approve", `approve-${intent.id}`, intent.amount, pg.sha256(input.TxTid + input.Signature));
    if (!op.claimed) return redirect(res, orderId);
    await db(`/rest/v1/payment_intents?id=eq.${intent.id}`, { method: "PATCH", body: JSON.stringify({ status: "in_progress", payment_key: input.TxTid, provider_payment_id: input.TxTid }) });
    intent.payment_key = input.TxTid;
    let data;
    try {
      data = await runtime.nicePost(pg.approvalFields(input, intent, config));
      const verified = pg.verifyApproval(data, intent, config, input);
      await db(`/rest/v1/payment_intents?id=eq.${intent.id}`, { method: "PATCH", body: JSON.stringify({ payment_response: runtime.receipt(data), provider_status: data.ResultCode }) });
      await runtime.operationState(op.operation_id, "succeeded", input.TxTid, data.ResultCode);
      if (verified.status === "awaiting_deposit") {
        const date = String(data.VbankExpDate || ""); const time = String(data.VbankExpTime || "235959").padEnd(6, "0");
        const due = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}+09:00`;
        await db("/rest/v1/rpc/record_nicepay_virtual_account", { method: "POST", body: JSON.stringify({ target_order_id: intent.order_id, target_payment_key: input.TxTid, target_account: { ...verified.virtualAccount, dueDate: due }, target_expires_at: due }) });
      } else {
        // A DB outage after verified approval must remain recoverable, not trigger a second charge.
        try { await runtime.finalize(intent, data); } catch { return redirect(res, orderId, "RECONCILIATION_REQUIRED"); }
      }
    } catch {
      try {
        const request = pg.approvalFields(input, intent, config, { netCancel: true });
        const cancelled = await runtime.nicePost(request);
        pg.verifyCancellation(cancelled, request, config, { netCancel: true });
        await runtime.operationState(op.operation_id, "cancelled", input.TxTid, cancelled.ResultCode);
        await db(`/rest/v1/payment_intents?id=eq.${intent.id}&status=neq.confirmed`, { method: "PATCH", body: JSON.stringify({ status: "cancelled", provider_status: "NET_CANCELLED" }) });
        await db("/rest/v1/rpc/release_expired_checkout_intents", { method: "POST", body: "{}" });
        return redirect(res, orderId, "NET_CANCELLED");
      } catch {
        await runtime.operationState(op.operation_id, "unknown", input.TxTid);
        return redirect(res, orderId, "RECONCILIATION_REQUIRED");
      }
    }
    return redirect(res, orderId);
  } catch (error) {
    console.error("nicepay-return", error.code || "CALLBACK_ERROR");
    return redirect(res, orderId, error.code || "PAYMENT_VERIFY_ERROR");
  }
};
function redirect(res, orderId, code = "") {
  const query = new URLSearchParams({ nicepay: "1", orderId, ...(code ? { paymentError: code } : {}) });
  res.statusCode = 303;
  res.setHeader("Location", "/payment?" + query);
  res.end();
}
