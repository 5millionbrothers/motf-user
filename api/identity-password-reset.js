const { json } = require("./_utils");
const { env, requireEnv, requestJson, supabaseRequest } = require("./_server");
const { allowCors, readBody, passwordIsValid, verifiedSession } = require("./_identity");
const { randomUUID } = require("crypto");
const { accountForLogin, limitAccountRequest, claimIdentitySession } = require("./_accounts");

module.exports = async function handler(req, res) {
  if (allowCors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { ok: false, message: "POST only." });
  try {
    requireEnv(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    const body = await readBody(req);
    const identifier = String(body.identifier || body.email || "").trim().toLowerCase();
    await limitAccountRequest(req, identifier);
    const password = String(body.password || "");
    if (!passwordIsValid(password)) return json(res, 400, { ok: false, message: "비밀번호는 영문·숫자·특수문자를 포함한 8~12자리여야 합니다." });
    const identity = await verifiedSession(String(body.identityToken || ""), "password_reset");
    const profile = await accountForLogin(identifier);
    if (!profile || !["approved", "pending"].includes(profile.status) || !profile.identity_ci_hash || profile.identity_ci_hash !== identity.verified_ci_hash) {
      return json(res, 403, { ok: false, message: "가입 정보와 본인인증 정보가 일치하지 않습니다." });
    }
    await claimIdentitySession(identity, profile.id);
    const authUser = await supabaseRequest(`/auth/v1/admin/users/${profile.id}`);
    const update = { password };
    if (!authUser.email_confirmed_at) {
      await supabaseRequest("/rest/v1/login_email_aliases", {
        method: "POST", headers: { Prefer: "resolution=ignore-duplicates" },
        body: JSON.stringify({ email: authUser.email.toLowerCase(), user_id: profile.id }),
      });
      const aliases = await supabaseRequest("/rest/v1/login_email_aliases?email=eq." + encodeURIComponent(authUser.email.toLowerCase()) + "&select=user_id&limit=1");
      if (aliases?.[0]?.user_id !== profile.id) return json(res, 409, { ok: false, message: "기존 이메일 연결을 확인할 수 없습니다. 운영팀에 문의해주세요." });
      update.email = randomUUID() + "@accounts.motf.invalid";
      update.email_confirm = true;
    }
    const base = env("SUPABASE_URL").replace(/\/$/, "");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const updated = await requestJson(`${base}/auth/v1/admin/users/${profile.id}`, {
      method: "PUT",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    if (!updated.ok) throw new Error(updated.data?.message || "비밀번호를 변경하지 못했습니다.");
    await supabaseRequest(`/rest/v1/profiles?id=eq.${profile.id}`, { method: "PATCH", body: JSON.stringify({ password_set_at: new Date().toISOString() }) });
    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, error.statusCode || 500, { ok: false, message: error.message || "비밀번호를 변경하지 못했습니다." });
  }
};
