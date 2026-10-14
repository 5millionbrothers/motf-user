const { json } = require("./_utils");
const { supabaseRequest } = require("./_server");
const {
  allowCors, readBody, sha256, randomToken, safeReturnUrl, kcpRegister, authenticatedUser,
} = require("./_identity");

const PURPOSES = new Set(["signup", "owner_signup", "password_reset", "profile_upgrade", "adult_purchase"]);
const OWNER_ORIGINS = new Set([
  "https://motfowner.co.kr",
  "https://www.motfowner.co.kr",
  "https://motf-owner-app.vercel.app",
]);

module.exports = async function handler(req, res) {
  if (allowCors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { ok: false, message: "POST only." });
  try {
    const body = await readBody(req);
    const purpose = String(body.purpose || "");
    if (!PURPOSES.has(purpose)) return json(res, 400, { ok: false, message: "본인인증 목적이 올바르지 않습니다." });
    const user = ["adult_purchase", "profile_upgrade"].includes(purpose)
      ? await authenticatedUser(req.headers.authorization || "") : null;
    if (["adult_purchase", "profile_upgrade"].includes(purpose) && !user?.id) return json(res, 401, { ok: false, message: "로그인이 필요합니다." });

    const identityToken = randomToken();
    const stateHash = sha256(identityToken);
    const returnUrl = safeReturnUrl(body.returnUrl, "https://motf.co.kr");
    const origin = new URL(returnUrl).origin;
    const callbackUrl = `${OWNER_ORIGINS.has(origin) ? "https://motf.co.kr" : origin}/api/identity-callback`;
    const orderId = `MOTF-CERT-${Date.now()}-${randomToken(5)}`;

    const inserted = await supabaseRequest("/rest/v1/identity_verification_sessions?select=id", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        purpose,
        user_id: user?.id || null,
        state_hash: stateHash,
        requested_email: String(body.email || "").trim().toLowerCase() || null,
        request_context: { return_url: returnUrl, account_type: body.accountType || "user" },
      }),
    });
    const sessionId = inserted?.[0]?.id;
    if (!sessionId) throw new Error("본인인증 세션을 만들지 못했습니다.");

    const registered = await kcpRegister({
      orderId,
      returnUrl: callbackUrl,
    });
    if (!registered?.regCertKey || !registered?.callUrl) throw new Error("KCP 인증창 정보를 받지 못했습니다.");

    await supabaseRequest(`/rest/v1/identity_verification_sessions?id=eq.${sessionId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        provider_transaction_id: registered.regCertKey,
        status: "pending",
        provider_response: { order_id: orderId },
      }),
    });
    return json(res, 200, {
      ok: true,
      identityToken,
      callUrl: registered.callUrl,
      form: {
        reg_cert_key: registered.regCertKey,
        kcp_page_submit_yn: body.mobile ? "Y" : "N",
      },
    });
  } catch (error) {
    return json(res, error.statusCode || 500, { ok: false, message: error.message || "본인인증을 시작하지 못했습니다." });
  }
};
