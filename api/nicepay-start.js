const { json, env, requireEnv, authenticatedUser, supabaseRequest: db } = require("./_server");
const pg = require("./_nicepay");
const runtime = require("./_nicepay-runtime");
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return json(res, 405, { ok: false });
  try {
    requireEnv(["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
    if (env("PAYMENT_PROVIDER") !== "nicepay") throw runtime.error("PROVIDER_NOT_ENABLED", "나이스 결제가 아직 활성화되지 않았습니다.", 503);
    const user = await authenticatedUser(req.headers.authorization || "");
    if (!user?.id) throw runtime.error("LOGIN_REQUIRED", "다시 로그인해주세요.", 401);
    const input = await runtime.body(req);
    const intent = await runtime.intentByOrder(input.orderId);
    await runtime.ownerAccess(intent, user.id);
    const config = pg.merchantConfig(intent.kind);
    if (!runtime.methods(intent.kind).includes(input.method)) throw runtime.error("METHOD_DISABLED", "사용할 수 없는 결제수단입니다.");
    const nonce = runtime.nonce();
    const fields = pg.checkoutFields(intent, config, { method: input.method, returnUrl: runtime.returnOrigin(req) + "/api/nicepay-return" });
    await db("/rest/v1/rpc/bind_nicepay_checkout", { method: "POST", body: JSON.stringify({ target_order_id: intent.order_id, target_customer_id: user.id, target_mid: config.mid, target_method: input.method, target_nonce_hash: pg.sha256(nonce) }) });
    Object.assign(fields, { ReqReserved: nonce, GoodsName: runtime.truncateEuc(intent.order_name || "모티프 예약", 40), BuyerName: runtime.truncateEuc(intent.draft?.customer_name || "이용자", 30), BuyerTel: String(intent.draft?.contact_phone || "").replace(/\D/g, "").slice(0, 20), TransType: "0" });
    if (input.method === "VBANK") fields.VbankExpDate = pg.kstTimestamp(new Date(Date.now() + 86400000)).slice(0, 12);
    if (input.method === "CELLPHONE") fields.GoodsCl = "1";
    return json(res, 200, { ok: true, fields });
  } catch (error) {
    console.error("nicepay-start", error.code || "ERROR");
    return json(res, error.statusCode || 500, { ok: false, code: error.code || "CHECKOUT_ERROR", message: error.message || "결제를 준비하지 못했습니다." });
  }
};
