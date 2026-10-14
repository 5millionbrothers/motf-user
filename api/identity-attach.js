const { json } = require("./_utils");
const { supabaseRequest } = require("./_server");
const { allowCors, readBody, verifiedSession, authenticatedUser } = require("./_identity");
const { claimIdentitySession } = require("./_accounts");

module.exports = async function handler(req, res) {
  if (allowCors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { ok: false, message: "POST only." });
  try {
    const user = await authenticatedUser(String(req.headers.authorization || ""));
    if (!user?.id) return json(res, 401, { ok: false, message: "로그인이 만료되었습니다." });
    const body = await readBody(req);
    const purpose = body.purpose === "adult_purchase" ? "adult_purchase" : "profile_upgrade";
    const identity = await verifiedSession(String(body.identityToken || ""), purpose);
    if (identity.user_id !== user.id) return json(res, 403, { ok: false, message: "현재 계정의 인증 내역이 아닙니다." });
    if (purpose === "adult_purchase" && !identity.is_adult) return json(res, 403, { ok: false, message: "주류는 성인만 주문할 수 있습니다." });
    const profiles = await supabaseRequest(`/rest/v1/profiles?id=eq.${user.id}&select=identity_ci_hash&limit=1`);
    if (profiles?.[0]?.identity_ci_hash && profiles[0].identity_ci_hash !== identity.verified_ci_hash) return json(res, 403, { ok: false, message: "계정에 등록된 본인정보와 일치하지 않습니다." });
    const duplicates = await supabaseRequest(`/rest/v1/profiles?identity_ci_hash=eq.${encodeURIComponent(identity.verified_ci_hash)}&id=neq.${encodeURIComponent(user.id)}&withdrawal_processed_at=is.null&select=id&limit=1`);
    if (duplicates?.length) return json(res, 409, { ok: false, message: "이미 다른 계정에 연결된 본인인증 정보입니다." });
    await claimIdentitySession(identity, user.id);
    await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        full_name: identity.verified_name,
        phone: identity.verified_phone,
        birth_date: identity.verified_birth_date,
        identity_provider: "kcp",
        identity_ci_hash: identity.verified_ci_hash,
        identity_verified_at: identity.verified_at,
        ...(purpose === "adult_purchase" ? {
          adult_verified_at: identity.verified_at,
          adult_verification_source: "adult_purchase",
          adult_verified_until: new Date(new Date(identity.verified_at).setUTCFullYear(new Date(identity.verified_at).getUTCFullYear() + 1)).toISOString(),
        } : {}),
      }),
    });
    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, error.statusCode || 500, { ok: false, message: error.message || "본인인증 정보를 연결하지 못했습니다." });
  }
};
