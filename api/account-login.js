const { json, requireEnv, supabaseRequest } = require("./_server");
const { allowCors, readBody } = require("./_identity");
const { accountForLogin, limitAccountRequest, passwordSession } = require("./_accounts");

module.exports = async function handler(req, res) {
  if (allowCors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return json(res, 405, { ok: false });
  try {
    requireEnv(["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
    const body = await readBody(req);
    const identifier = String(body.identifier || "").trim();
    const password = String(body.password || "");
    if (!identifier || identifier.length > 254 || !password || password.length > 256) return json(res, 400, { ok: false, message: "아이디와 비밀번호를 입력해주세요." });
    await limitAccountRequest(req, identifier);
    const account = await accountForLogin(identifier);
    if (!account || ["suspended", "rejected"].includes(account.status)) return json(res, 401, { ok: false, message: "아이디 또는 비밀번호가 일치하지 않습니다." });
    const authUser = await supabaseRequest(`/auth/v1/admin/users/${account.id}`);
    const result = await passwordSession(authUser.email, password);
    if (!result.ok || !result.data?.access_token) return json(res, 401, { ok: false, message: result.data?.error_code === "email_not_confirmed" ? "기존 계정의 이메일 인증 또는 휴대폰 본인확인을 통한 비밀번호 재설정이 필요합니다." : "아이디 또는 비밀번호가 일치하지 않습니다." });
    return json(res, 200, { ok: true, session: { access_token: result.data.access_token, refresh_token: result.data.refresh_token } });
  } catch (error) {
    return json(res, error.statusCode || 500, { ok: false, message: error.statusCode === 429 ? error.message : "로그인을 처리하지 못했습니다. 잠시 후 다시 시도해주세요." });
  }
};
