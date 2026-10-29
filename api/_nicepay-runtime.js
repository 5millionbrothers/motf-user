const iconv = require("iconv-lite");
const { randomBytes } = require("node:crypto");
const pg = require("./_nicepay");
const { env, supabaseRequest: db } = require("./_server");
const METHODS = { CARD: "카드·간편결제", BANK: "계좌이체", VBANK: "가상계좌", CELLPHONE: "휴대폰 결제" };
const METHODS_ENV = { stay: "NICEPAY_STAY_METHODS", market: "NICEPAY_MARKET_METHODS" };
function error(code, message, statusCode = 409) { return Object.assign(new Error(message), { code, statusCode }); }
function methods(kind) {
  const list = (env(METHODS_ENV[kind]) || "CARD").split(",").map(x => x.trim()).filter(x => METHODS[x]);
  return [...new Set(list)];
}
function siteOrigin() {
  const url = new URL(env("MOTF_PUBLIC_ORIGIN") || "https://motf.co.kr");
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw error("INVALID_ORIGIN", "결제 복귀 도메인 설정을 확인해주세요.", 503);
  return url.origin;
}
function truncateEuc(value, limit) {
  let result = "";
  for (const char of String(value || "").replace(/[\x00-\x1f\[\]"]/g, " ")) {
    if (iconv.encode(result + char, "euc-kr").length > limit) break;
    result += char;
  }
  return result;
}
function returnOrigin(req) {
  const declared = siteOrigin();
  const supplied = String(req.headers.origin || "");
  return [declared, "https://motf.co.kr", "https://www.motf.co.kr"].includes(supplied) ? supplied : declared;
}
function formEncode(fields) {
  const encode = value => [...iconv.encode(String(value), "euc-kr")].map(byte => /[A-Za-z0-9_.~-]/.test(String.fromCharCode(byte)) ? String.fromCharCode(byte) : "%" + byte.toString(16).padStart(2, "0").toUpperCase()).join("");
  return Object.entries(fields).map(([key, value]) => encode(key) + "=" + encode(value)).join("&");
}
async function nicePost(request) {
  const permitted = [
    "https://pg-api.nicepay.co.kr/webapi/cancel_process.jsp",
    "https://webapi.nicepay.co.kr/webapi/inquery/trans_status.jsp",
    ...["dc1", "dc2"].flatMap(dc => [`https://${dc}-api.nicepay.co.kr/webapi/pay_process.jsp`, `https://${dc}-api.nicepay.co.kr/webapi/cancel_process.jsp`]),
  ];
  if (!permitted.includes(request.url)) throw error("UNTRUSTED_GATEWAY", "결제 서버 주소가 올바르지 않습니다.");
  const response = await fetch(request.url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded; charset=euc-kr" }, body: formEncode(request.fields), redirect: "error", signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw error("NICEPAY_HTTP_ERROR", "나이스페이 응답을 확인하지 못했습니다.", 502);
  const bytes = Buffer.from(await response.arrayBuffer());
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { text = iconv.decode(bytes, "euc-kr"); }
  let data;
  try { data = JSON.parse(text); } catch { throw error("NICEPAY_INVALID_RESPONSE", "나이스페이 응답 형식을 확인하지 못했습니다.", 502); }
  return data;
}
async function body(req) {
  if (req.body && !Buffer.isBuffer(req.body) && typeof req.body === "object") return req.body;
  let data = req.body;
  if (data == null) {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 32768) throw error("BODY_TOO_LARGE", "요청이 너무 큽니다.", 413); chunks.push(chunk); }
    data = Buffer.concat(chunks);
  }
  if (Buffer.isBuffer(data)) data = iconv.decode(data, /euc-kr/i.test(req.headers["content-type"] || "") ? "euc-kr" : "utf8");
  if (String(req.headers["content-type"] || "").includes("application/json")) return JSON.parse(data || "{}");
  return Object.fromEntries(new URLSearchParams(String(data || "")));
}
async function intentByOrder(orderId) {
  if (!/^[a-z\d_-]{1,64}$/i.test(String(orderId || ""))) throw error("INVALID_ORDER", "주문번호를 확인해주세요.", 400);
  const rows = await db(`/rest/v1/payment_intents?order_id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`);
  if (!rows?.[0]) throw error("ORDER_NOT_FOUND", "결제 준비 내역을 찾을 수 없습니다.", 404);
  return rows[0];
}
async function profile(userId) {
  const rows = await db(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,role,status,withdrawal_processed_at&limit=1`);
  if (!rows?.[0] || rows[0].status !== "approved" || rows[0].withdrawal_processed_at) throw error("ACCOUNT_UNAVAILABLE", "이용 가능한 계정이 아닙니다.", 403);
  return rows[0];
}
async function ownerAccess(intent, userId, allowOrganizationMember = false) {
  await profile(userId);
  const member = intent.organization_id && await db("/rest/v1/rpc/is_organization_member", { method: "POST", body: JSON.stringify({ target_id: intent.organization_id, target_user: userId }) }) === true;
  if (intent.customer_id !== userId && !(allowOrganizationMember && member)) throw error("ORDER_NOT_FOUND", "결제 준비 내역을 찾을 수 없습니다.", 404);
  if (intent.organization_id && !member) throw error("ORGANIZATION_ACCESS", "단체 결제 권한이 해제되었습니다.", 403);
}
async function operation(intent, kind, key, amount, fingerprint) {
  const rows = await db("/rest/v1/rpc/claim_payment_provider_operation", { method: "POST", body: JSON.stringify({ target_provider: intent.provider, target_operation_key: key, target_operation_kind: kind, target_merchant_id: intent.provider_merchant_id || "legacy-toss", target_amount: amount, target_fingerprint: fingerprint, target_payment_intent_id: intent.id }) });
  return rows[0];
}
async function operationState(id, state, reference, code) {
  await db(`/rest/v1/payment_provider_operations?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ state, provider_reference: reference || null, provider_result_code: code || null, updated_at: new Date().toISOString() }) });
}
async function queryPayment(intent) {
  const config = pg.merchantConfig(intent.kind);
  if (config.mid !== intent.provider_merchant_id || !intent.payment_key?.startsWith(config.mid)) throw error("MERCHANT_MISMATCH", "원결제 가맹점 설정을 확인해주세요.");
  const EdiDate = pg.kstTimestamp();
  const result = await nicePost({ url: "https://webapi.nicepay.co.kr/webapi/inquery/trans_status.jsp", fields: { TID: intent.payment_key, MID: config.mid, EdiDate, SignData: pg.sha256(intent.payment_key + config.mid + EdiDate + config.merchantKey), CharSet: "utf-8" } });
  if (result.ResultCode !== "0000" || result.TID !== intent.payment_key || !["0", "1", "9"].includes(String(result.Status))) throw error("NICEPAY_QUERY_FAILED", "나이스 결제 상태를 확인하지 못했습니다.", 502);
  return { ...result, Status: String(result.Status) };
}
function publicResult(intent) {
  return { ok: true, orderId: intent.order_id, kind: intent.kind, amount: intent.amount, itemName: intent.order_name, status: intent.status === "confirmed" ? "paid" : intent.status === "virtual_account_issued" ? "awaiting_deposit" : intent.status, transactionId: intent.transaction_id || null, virtualAccount: intent.virtual_account || null, expiresAt: intent.expires_at };
}
function receipt(data) {
  const keys = ["ResultCode", "MID", "Moid", "TID", "Amt", "PayMethod", "AuthCode", "AuthDate", "VbankBankCode", "VbankBankName", "VbankNum", "VbankExpDate", "VbankExpTime", "CancelAmt", "CancelNum", "RemainAmt", "CancelDate", "CancelTime", "Signature"];
  return Object.fromEntries(keys.filter(key => data[key] != null).map(key => [key, data[key]]));
}
async function finalize(intent, data) {
  return db("/rest/v1/rpc/finalize_provider_payment_intent", { method: "POST", body: JSON.stringify({ target_provider: "nicepay", target_customer_id: intent.customer_id, target_order_id: intent.order_id, target_payment_key: intent.payment_key, verified_payment: { order_id: intent.order_id, payment_key: intent.payment_key, amount: intent.amount, status: "paid", method: intent.payment_method, receipt: receipt(data) } }) });
}
module.exports = { METHODS, methods, siteOrigin, returnOrigin, truncateEuc, formEncode, nicePost, body, intentByOrder, profile, ownerAccess, operation, operationState, queryPayment, publicResult, receipt, finalize, error, nonce: () => randomBytes(32).toString("hex") };
