const { env, requestJson, supabaseRequest } = require("./_server");
const { sha256 } = require("./_identity");

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function validUsername(value) {
  return /^[a-z][a-z0-9_]{3,23}$/.test(value);
}

async function accountForLogin(identifier) {
  const value = normalizeUsername(identifier);
  const column = value.includes("@") ? "email" : "username";
  if (column === "username" && !validUsername(value)) return null;
  const rows = await supabaseRequest("/rest/v1/rpc/resolve_account_login", { method: "POST", body: JSON.stringify({ target_identifier: value }) });
  return rows?.[0] || null;
}

async function limitAccountRequest(req, identifier) {
  const address = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  for (const bucket of [sha256(`ip:${address}`), sha256(`account:${normalizeUsername(identifier)}`)]) {
    const allowed = await supabaseRequest("/rest/v1/rpc/consume_account_request_limit", {
      method: "POST", body: JSON.stringify({ target_bucket: bucket }),
    });
    if (!allowed) {
      throw Object.assign(new Error("요청이 많습니다. 잠시 후 다시 시도해주세요."), { statusCode: 429 });
    }
  }
}

async function passwordSession(email, password) {
  return requestJson(`${env("SUPABASE_URL").replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: env("SUPABASE_PUBLISHABLE_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }, 12000);
}

async function claimIdentitySession(identity, userId = null) {
  const rows = await supabaseRequest(`/rest/v1/identity_verification_sessions?id=eq.${identity.id}&status=eq.verified&select=id`, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "consumed", consumed_at: new Date().toISOString(), user_id: userId }),
  });
  if (!rows?.length) throw Object.assign(new Error("이미 사용된 본인인증입니다. 다시 인증해주세요."), { statusCode: 409 });
}

module.exports = { normalizeUsername, validUsername, accountForLogin, limitAccountRequest, passwordSession, claimIdentitySession };
