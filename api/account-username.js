const { json, requireEnv, authenticatedUser, supabaseRequest } = require("./_server");
const { allowCors, readBody } = require("./_identity");
const { normalizeUsername, validUsername } = require("./_accounts");

module.exports = async function handler(req, res) {
  if (allowCors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { ok: false });
  try {
    requireEnv(["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
    const user = await authenticatedUser(req.headers.authorization || "");
    if (!user?.id) return json(res, 401, { ok: false, message: "로그인이 필요합니다." });
    const body = await readBody(req);
    const username = normalizeUsername(body.username);
    if (!validUsername(username)) return json(res, 400, { ok: false, message: "아이디는 영문으로 시작하는 영문 소문자·숫자·밑줄 4~24자리로 입력해주세요." });
    await supabaseRequest("/rest/v1/rpc/assign_login_username", { method: "POST", body: JSON.stringify({ target_user_id: user.id, target_username: username }) });
    return json(res, 200, { ok: true, username });
  } catch (error) {
    return json(res, error.details?.code === "23505" ? 409 : error.statusCode || 400, { ok: false, message: error.details?.code === "23505" ? "이미 사용 중인 아이디입니다." : error.message || "아이디를 등록하지 못했습니다." });
  }
};
