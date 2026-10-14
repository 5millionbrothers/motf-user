const { randomUUID } = require("crypto");
const { json, requireEnv, supabaseRequest } = require("./_server");
const { allowCors, readBody, passwordIsValid, verifiedSession } = require("./_identity");
const { normalizeUsername, validUsername, limitAccountRequest, claimIdentitySession } = require("./_accounts");

module.exports = async function handler(req, res) {
  if (allowCors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { ok: false });
  let createdUserId = "";
  try {
    requireEnv(["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
    const body = await readBody(req);
    const accountType = body.accountType === "partner" ? "partner" : "user";
    const purpose = accountType === "partner" ? "owner_signup" : "signup";
    const username = normalizeUsername(body.username);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!validUsername(username)) return json(res, 400, { ok: false, message: "아이디는 영문으로 시작하는 영문 소문자·숫자·밑줄 4~24자리로 입력해주세요." });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { ok: false, message: "연락 이메일을 확인해주세요." });
    if (!passwordIsValid(password)) return json(res, 400, { ok: false, message: "비밀번호는 영문·숫자·특수문자를 포함한 8~12자리여야 합니다." });
    if (body.termsAccepted !== true) return json(res, 400, { ok: false, message: "필수 약관에 동의해주세요." });
    if (accountType === "partner" && (!["stay", "market"].includes(body.businessType) || !String(body.businessName || "").trim())) return json(res, 400, { ok: false, message: "파트너 유형과 업장명을 확인해주세요." });
    await limitAccountRequest(req, username);
    const identity = await verifiedSession(String(body.identityToken || ""), purpose);
    const duplicates = await supabaseRequest("/rest/v1/profiles?identity_ci_hash=eq." + identity.verified_ci_hash + "&withdrawal_processed_at=is.null&select=id&limit=1");
    if (duplicates?.length) return json(res, 409, { ok: false, message: "이미 가입된 본인인증 정보입니다. 기존 계정으로 로그인하거나 비밀번호 찾기를 이용해주세요." });
    const usernames = await supabaseRequest("/rest/v1/profiles?username=eq." + encodeURIComponent(username) + "&select=id&limit=1");
    if (usernames?.length) return json(res, 409, { ok: false, message: "이미 사용 중인 아이디입니다." });
    await claimIdentitySession(identity);
    // Contact emails do not become verified OAuth login identities.
    const authEmail = randomUUID() + "@accounts.motf.invalid";
    const user = await supabaseRequest("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: authEmail, password, email_confirm: true,
        user_metadata: {
          account_type: accountType, full_name: identity.verified_name, phone: identity.verified_phone,
          ...(accountType === "partner" ? { business_type: body.businessType, business_name: String(body.businessName).trim() } : {}),
        },
      }),
    });
    if (!user?.id) throw new Error("회원가입 결과를 확인하지 못했습니다.");
    createdUserId = user.id;
    await supabaseRequest("/rest/v1/rpc/complete_identity_signup_profile", {
      method: "POST",
      body: JSON.stringify({
        target_user_id: user.id, target_email: email || null, target_full_name: identity.verified_name,
        target_phone: identity.verified_phone, target_birth_date: identity.verified_birth_date,
        target_ci_hash: identity.verified_ci_hash, target_verified_at: identity.verified_at,
        target_is_adult: false, target_account_type: accountType,
      }),
    });
    await supabaseRequest("/rest/v1/rpc/assign_login_username", { method: "POST", body: JSON.stringify({ target_user_id: user.id, target_username: username }) });
    await supabaseRequest("/rest/v1/profiles?id=eq." + user.id, { method: "PATCH", body: JSON.stringify({ terms_accepted_at: new Date().toISOString(), profile_completed_at: new Date().toISOString() }) });
    await supabaseRequest("/rest/v1/identity_verification_sessions?id=eq." + identity.id, { method: "PATCH", body: JSON.stringify({ user_id: user.id }) });
    createdUserId = "";
    return json(res, 200, { ok: true, username, emailConfirmationRequired: false });
  } catch (error) {
    if (createdUserId) {
      try { await supabaseRequest("/auth/v1/admin/users/" + createdUserId, { method: "DELETE" }); }
      catch { console.error("identity-signup rollback failed"); }
    }
    return json(res, error.details?.code === "23505" ? 409 : error.statusCode || 500, { ok: false, message: error.details?.code === "23505" ? "이미 사용 중인 아이디 또는 본인인증 정보입니다." : error.message || "회원가입에 실패했습니다." });
  }
};
