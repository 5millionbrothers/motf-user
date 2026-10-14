const {
  json,
  env,
  requireEnv,
  requireTossSecret,
  authenticatedUser,
  supabaseRequest,
  tossRequest,
} = require("./_server");

const MAX_SINGLE_PAYMENT_AMOUNT = 10_000_000;
const PAYMENT_LIMIT_MESSAGE = "단건 결제는 10,000,000원까지 가능합니다.";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, message: "POST 요청만 사용할 수 있습니다." });

  try {
    requireEnv(["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
    const user = await authenticatedUser(req.headers.authorization || "");
    if (!user?.id) return json(res, 401, { ok: false, message: "로그인이 만료되었습니다. 다시 로그인해주세요." });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const paymentKey = String(body.paymentKey || "").trim();
    const orderId = String(body.orderId || "").trim();
    const amount = Number(body.amount);
    if (!paymentKey || !orderId || !Number.isInteger(amount) || amount <= 0) {
      return json(res, 400, { ok: false, message: "결제 승인 정보가 올바르지 않습니다." });
    }
    if (amount > MAX_SINGLE_PAYMENT_AMOUNT) {
      return json(res, 422, { ok: false, code: "PAYMENT_AMOUNT_LIMIT_EXCEEDED", message: PAYMENT_LIMIT_MESSAGE });
    }

    const intents = await supabaseRequest(
      `/rest/v1/payment_intents?select=id,order_id,customer_id,organization_id,kind,amount,original_amount,status,provider&order_id=eq.${encodeURIComponent(orderId)}&limit=1`,
    );
    const intent = intents?.[0];
    if (!intent || intent.customer_id !== user.id) return json(res, 404, { ok: false, message: "결제 준비 내역을 찾을 수 없습니다." });
    if (intent.organization_id && await supabaseRequest("/rest/v1/rpc/is_organization_member", {
      method: "POST", body: JSON.stringify({ target_id: intent.organization_id, target_user: user.id }),
    }) !== true) return json(res, 403, { ok: false, message: "단체 결제 권한이 해제되었습니다." });
    if (Number(intent.amount) > MAX_SINGLE_PAYMENT_AMOUNT || Number(intent.original_amount || intent.amount) > MAX_SINGLE_PAYMENT_AMOUNT) {
      return json(res, 422, { ok: false, code: "PAYMENT_AMOUNT_LIMIT_EXCEEDED", message: PAYMENT_LIMIT_MESSAGE });
    }
    if (Number(intent.amount) !== amount) return json(res, 409, { ok: false, message: "결제 금액이 변경되었습니다. 주문을 다시 준비해주세요." });
    const merchantKind = intent.kind === "market" ? "market" : "stay";
    const tossSecret = requireTossSecret(merchantKind);

    let payment;
    if (intent.status === "confirmed") {
      payment = await tossRequest(`/v1/payments/${encodeURIComponent(paymentKey)}`, {}, tossSecret);
    } else {
      payment = await tossRequest("/v1/payments/confirm", {
        method: "POST",
        headers: { "TossPayments-Idempotency-Key": `motf-confirm-${intent.id}` },
        body: JSON.stringify({ paymentKey, orderId, amount }),
      }, tossSecret);
    }

    const finalized = await supabaseRequest("/rest/v1/rpc/finalize_toss_payment_intent", {
      method: "POST",
      body: JSON.stringify({
        target_customer_id: user.id,
        target_order_id: orderId,
        target_payment_key: paymentKey,
        toss_payment: payment,
      }),
    });

    return json(res, 200, {
      ok: true,
      status: "paid",
      paymentMethod: payment.method,
      transactionId: finalized?.[0]?.transaction_id || null,
      kind: finalized?.[0]?.kind || null,
    });
  } catch (error) {
    console.error("toss-confirm", error);
    return json(res, error.statusCode || 500, {
      ok: false,
      code: error.code || "TOSS_CONFIRM_ERROR",
      message: error.message || "결제 승인에 실패했습니다.",
    });
  }
};
