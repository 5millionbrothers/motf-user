const { json, requireEnv, authenticatedUser, supabaseRequest: db } = require("./_server");
const runtime = require("./_nicepay-runtime");
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return json(res, 405, { ok: false });
  try {
    requireEnv(["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
    const user = await authenticatedUser(req.headers.authorization || "");
    if (!user?.id) throw runtime.error("LOGIN_REQUIRED", "결제 결과를 확인하려면 로그인해주세요.", 401);
    const input = await runtime.body(req);
    let intent = await runtime.intentByOrder(input.orderId);
    await runtime.ownerAccess(intent, user.id, true);
    if (intent.provider === "nicepay" && intent.payment_key && ["in_progress", "virtual_account_issued"].includes(intent.status)) {
      const ops = await db(`/rest/v1/payment_provider_operations?payment_intent_id=eq.${intent.id}&operation_kind=eq.approve&select=state&limit=1`);
      if (ops?.[0]?.state === "succeeded") {
        const status = await runtime.queryPayment(intent);
        if (status.Status === "0") { await runtime.finalize(intent, intent.payment_response || {}); intent = await runtime.intentByOrder(input.orderId); }
      }
    }
    return json(res, 200, runtime.publicResult(intent));
  } catch (error) {
    console.error("payment-status", error.code || "STATUS_ERROR");
    return json(res, error.statusCode || 502, { ok: false, code: error.code || "STATUS_ERROR", message: error.message || "결제 상태를 확인하지 못했습니다." });
  }
};
