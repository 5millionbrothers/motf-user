const crypto = require("crypto");
const { env, requireEnv, requestJson, supabaseRequest, authenticatedUser } = require("./_server");
const { encryptJson, decryptJson } = require("./_kcp-crypto");

const ALLOWED_ORIGINS = new Set([
  "https://motf.co.kr",
  "https://www.motf.co.kr",
  "https://motfowner.co.kr",
  "https://www.motfowner.co.kr",
  "https://motf-prototype.vercel.app",
  "https://motf-owner-app.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:4177",
  "http://127.0.0.1:4189",
]);

function allowCors(req, res) {
  const origin = String(req.headers.origin || "");
  if (ALLOWED_ORIGINS.has(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

function readBody(req) {
  const parse = (raw) => String(req.headers["content-type"] || "").includes("application/x-www-form-urlencoded")
    ? Object.fromEntries(new URLSearchParams(raw)) : raw ? JSON.parse(raw) : {};
  if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
    try { return Promise.resolve(parse(String(req.body))); }
    catch (error) { return Promise.reject(error); }
  }
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      try {
        resolve(parse(raw));
      } catch (error) { reject(error); }
    });
    req.on("error", reject);
  });
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function identityHash(value) {
  requireEnv(["IDENTITY_HASH_PEPPER"]);
  return sha256(`${env("IDENTITY_HASH_PEPPER")}:${String(value || "")}`);
}

function passwordIsValid(value) {
  return /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d\s]).{8,12}$/.test(String(value || ""));
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 11);
}

function normalizeBirthDate(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 8) return "";
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function isAdult(birthDate) {
  const date = new Date(`${birthDate}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const beforeBirthday = today.getMonth() < date.getMonth()
    || (today.getMonth() === date.getMonth() && today.getDate() < date.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 19;
}

function safeReturnUrl(value, fallbackOrigin = "https://motf.co.kr") {
  try {
    const url = new URL(String(value || ""));
    if (!ALLOWED_ORIGINS.has(url.origin)) throw new Error("허용되지 않은 복귀 주소입니다.");
    return url.toString();
  } catch {
    return `${fallbackOrigin}/`;
  }
}

function kcpEndpoints() {
  const production = env("KCP_CERT_ENV").toLowerCase() === "production";
  const host = production ? "https://cert.kcp.co.kr" : "https://testcert.kcp.co.kr";
  return {
    register: `${host}/api/reg/certDataReg.do`,
    result: `${host}/api/query/getCertData.do`,
  };
}

async function kcpRegister({ orderId, returnUrl }) {
  requireEnv(["KCP_CERT_SITE_CODE", "KCP_CERT_ENC_KEY"]);
  const siteCode = env("KCP_CERT_SITE_CODE");
  const requestData = {
    site_cd: siteCode,
    ordr_idxx: orderId,
    Ret_URL: returnUrl,
    web_siteid: env("KCP_CERT_WEB_SITE_ID"),
    param_opt_1: "",
    param_opt_2: "",
    param_opt_3: "",
  };
  const encrypted = encryptJson(requestData, env("KCP_CERT_ENC_KEY"), siteCode);
  const result = await requestJson(kcpEndpoints().register, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      site_cd: siteCode,
      rv: encrypted.rv,
    },
    body: encrypted.enc_data,
  }, 15000);
  if (!result.ok || result.data?.res_cd !== "0000") {
    const error = new Error(result.data?.res_msg || result.data?.message || "KCP 본인인증 거래등록에 실패했습니다.");
    error.statusCode = result.ok ? 502 : result.status;
    throw error;
  }
  return { regCertKey: result.data.reg_cert_key, callUrl: result.data.call_url };
}

async function kcpResult({ regCertKey, orderId }) {
  requireEnv(["KCP_CERT_SITE_CODE", "KCP_CERT_ENC_KEY"]);
  const siteCode = env("KCP_CERT_SITE_CODE");
  const result = await requestJson(kcpEndpoints().result, {
    method: "POST",
    headers: { "Content-Type": "application/json", site_cd: siteCode },
    body: JSON.stringify({ reg_cert_key: regCertKey, ordr_idxx: orderId }),
  }, 15000);
  if (!result.ok || result.data?.res_cd !== "0000") {
    const error = new Error(result.data?.res_msg || result.data?.message || "KCP 본인인증 결과 조회에 실패했습니다.");
    error.statusCode = result.ok ? 502 : result.status;
    throw error;
  }
  if (!result.data?.enc_cert_data || !result.data?.rv) throw new Error("KCP 본인인증 결과가 비어 있습니다.");
  return decryptJson(result.data.enc_cert_data, result.data.rv, env("KCP_CERT_ENC_KEY"), siteCode);
}

async function verifiedSession(identityToken, purpose) {
  const stateHash = sha256(identityToken);
  const rows = await supabaseRequest(`/rest/v1/identity_verification_sessions?state_hash=eq.${stateHash}&purpose=eq.${encodeURIComponent(purpose)}&status=eq.verified&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*&limit=1`);
  const session = rows?.[0];
  if (!session) {
    const error = new Error("본인인증이 만료되었거나 완료되지 않았습니다.");
    error.statusCode = 401;
    throw error;
  }
  return session;
}

async function consumeSession(id, userId = null) {
  await supabaseRequest(`/rest/v1/identity_verification_sessions?id=eq.${encodeURIComponent(id)}&status=eq.verified`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "consumed", consumed_at: new Date().toISOString(), ...(userId ? { user_id: userId } : {}) }),
  });
}

module.exports = {
  allowCors,
  readBody,
  sha256,
  randomToken,
  identityHash,
  passwordIsValid,
  normalizePhone,
  normalizeBirthDate,
  isAdult,
  safeReturnUrl,
  kcpRegister,
  kcpResult,
  verifiedSession,
  consumeSession,
  authenticatedUser,
};
