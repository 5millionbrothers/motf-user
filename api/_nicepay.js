// NICEPAY legacy authentication API (MerchantKey/MID), not the separate REST client-key API.
const { createHash, timingSafeEqual } = require("node:crypto");

const APPROVAL_CODES = Object.freeze({ CARD: "3001", BANK: "4000", VBANK: "4100", CELLPHONE: "A000" });
const GATEWAYS = Object.freeze({
  approval: ["https://dc1-api.nicepay.co.kr/webapi/pay_process.jsp", "https://dc2-api.nicepay.co.kr/webapi/pay_process.jsp"],
  netCancel: ["https://dc1-api.nicepay.co.kr/webapi/cancel_process.jsp", "https://dc2-api.nicepay.co.kr/webapi/cancel_process.jsp"],
});

function fail(code, message) { throw Object.assign(new Error(message), { code, statusCode: 409 }); }
function sha256(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function verifyHash(actual, expected) {
  return /^[a-f\d]{64}$/i.test(String(actual || ""))
    && timingSafeEqual(Buffer.from(actual.toLowerCase(), "hex"), Buffer.from(expected, "hex"));
}
function amount(value, allowZero = false) {
  const raw = String(value ?? "");
  if (!/^\d{1,12}$/.test(raw)) fail("INVALID_AMOUNT", "결제 금액 형식을 확인해주세요.");
  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number < (allowZero ? 0 : 1)) fail("INVALID_AMOUNT", "결제 금액을 확인해주세요.");
  return number;
}
function kstTimestamp(now = new Date()) {
  if (Number.isNaN(now.getTime())) fail("INVALID_DATE", "요청 일시를 확인해주세요.");
  return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 19).replace(/\D/g, "");
}
function credentials(config) {
  if (!/^[a-z\d]{10}$/i.test(String(config?.mid || "")) || !config?.merchantKey) {
    fail("NICEPAY_NOT_CONFIGURED", "나이스페이 MID와 MerchantKey 설정이 필요합니다.");
  }
  return config;
}
function merchantConfig(kind, environment = process.env) {
  if (!["stay", "market"].includes(kind)) fail("INVALID_KIND", "결제 업종을 확인해주세요.");
  const prefix = kind === "stay" ? "NICEPAY_STAY_" : "NICEPAY_MARKET_";
  // No cross-MID fallback: a market payment must never use accommodation credentials.
  return credentials({ mid: String(environment[prefix + "MID"] || "").trim(), merchantKey: String(environment[prefix + "MERCHANT_KEY"] || "").trim() });
}
function orderId(value) {
  if (!/^[a-z\d_-]{1,64}$/i.test(String(value || ""))) fail("INVALID_ORDER", "주문번호 형식을 확인해주세요.");
  return String(value);
}
function gateway(url, operation) {
  if (!GATEWAYS[operation]?.includes(url)) fail("UNTRUSTED_GATEWAY", "허용되지 않은 결제 서버 주소입니다.");
  return url;
}
function paymentMethod(value) {
  if (!Object.hasOwn(APPROVAL_CODES, value)) fail("INVALID_METHOD", "지원하지 않는 결제수단입니다.");
  return value;
}
function checkoutFields(intent, config, { method, returnUrl, now } = {}) {
  credentials(config);
  const total = amount(intent.amount);
  if (total > 10000000 || Number(intent.original_amount || total) > 10000000) fail("PAYMENT_AMOUNT_LIMIT_EXCEEDED", "단건 결제는 10,000,000원까지 가능합니다.");
  const returnTarget = new URL(returnUrl);
  if (returnTarget.protocol !== "https:" || returnTarget.username || returnTarget.password || returnTarget.hash) fail("INVALID_RETURN_URL", "서버에 설정된 HTTPS 콜백 주소가 필요합니다.");
  const EdiDate = kstTimestamp(now);
  return {
    MID: config.mid, Moid: orderId(intent.order_id), Amt: String(total), EdiDate,
    SignData: sha256(EdiDate + config.mid + total + config.merchantKey),
    PayMethod: paymentMethod(method), ReturnURL: returnTarget.href, CharSet: "utf-8",
  };
}
function verifyAuthentication(response, intent, config) {
  credentials(config);
  if (response.AuthResultCode !== "0000") fail("AUTHENTICATION_FAILED", "결제 인증이 완료되지 않았습니다.");
  if (response.MID !== config.mid || response.Moid !== intent.order_id || amount(response.Amt) !== Number(intent.amount)) fail("PAYMENT_MISMATCH", "결제 인증 정보가 주문과 일치하지 않습니다.");
  if (!response.AuthToken || !/^[a-z\d]{30}$/i.test(String(response.TxTid || "")) || !response.TxTid.startsWith(config.mid)) fail("INVALID_AUTH_TOKEN", "결제 인증 토큰 또는 거래번호가 올바르지 않습니다.");
  paymentMethod(response.PayMethod);
  if (!verifyHash(response.Signature, sha256(response.AuthToken + config.mid + response.Amt + config.merchantKey))) fail("INVALID_SIGNATURE", "결제 인증 서명 검증에 실패했습니다.");
  gateway(response.NextAppURL, "approval");
  gateway(response.NetCancelURL, "netCancel");
  return response;
}
function approvalFields(authentication, intent, config, { netCancel = false, now } = {}) {
  verifyAuthentication(authentication, intent, config);
  const EdiDate = kstTimestamp(now);
  return {
    url: gateway(netCancel ? authentication.NetCancelURL : authentication.NextAppURL, netCancel ? "netCancel" : "approval"),
    fields: {
      TID: authentication.TxTid, AuthToken: authentication.AuthToken, MID: config.mid,
      Amt: authentication.Amt, EdiDate, CharSet: "utf-8",
      SignData: sha256(authentication.AuthToken + config.mid + authentication.Amt + EdiDate + config.merchantKey),
      ...(netCancel ? { NetCancel: "1" } : {}),
    },
  };
}
function verifyApproval(response, intent, config, authentication) {
  credentials(config);
  if (!authentication) fail("AUTHENTICATION_REQUIRED", "검증된 인증 응답이 필요합니다.");
  verifyAuthentication(authentication, intent, config);
  if (response.MID !== config.mid || response.Moid !== intent.order_id || response.TID !== authentication.TxTid
    || response.PayMethod !== authentication.PayMethod || amount(response.Amt) !== Number(intent.amount)) fail("PAYMENT_MISMATCH", "승인 응답이 주문과 일치하지 않습니다.");
  if (!verifyHash(response.Signature, sha256(response.TID + config.mid + response.Amt + config.merchantKey))) fail("INVALID_SIGNATURE", "결제 승인 서명 검증에 실패했습니다.");
  const method = paymentMethod(response.PayMethod);
  if (response.ResultCode !== APPROVAL_CODES[method]) fail("APPROVAL_FAILED", "결제 승인이 완료되지 않았습니다.");
  return { provider: "nicepay", orderId: intent.order_id, transactionId: response.TID, amount: amount(response.Amt), method,
    status: method === "VBANK" ? "awaiting_deposit" : "paid",
    ...(method === "VBANK" ? { virtualAccount: { bankCode: response.VbankBankCode, bankName: response.VbankBankName, accountNumber: response.VbankNum, dueDate: response.VbankExpDate, dueTime: response.VbankExpTime } } : {}),
  };
}
function cancelFields(payment, config, { cancelAmount, cancellationId, reason, refundAccount, now } = {}) {
  credentials(config);
  if (payment.provider !== "nicepay" || payment.mid !== config.mid || !/^[a-z\d]{30}$/i.test(String(payment.tid || "")) || !payment.tid.startsWith(config.mid)) fail("WRONG_PROVIDER", "원결제 가맹점과 거래번호를 확인해주세요.");
  const refund = amount(cancelAmount);
  if (refund > amount(payment.remainingAmount)) fail("EXCESS_REFUND", "환불 가능 금액을 초과했습니다.");
  if (!reason?.trim()) fail("MISSING_REASON", "취소 사유가 필요합니다.");
  const EdiDate = kstTimestamp(now);
  const fields = {
    TID: payment.tid, MID: config.mid, Moid: orderId(cancellationId), CancelAmt: String(refund),
    CancelMsg: reason.trim(), PartialCancelCode: refund === amount(payment.originalAmount) ? "0" : "1",
    EdiDate, SignData: sha256(config.mid + refund + EdiDate + config.merchantKey), CharSet: "utf-8",
  };
  if (payment.method === "VBANK" && payment.status === "paid") {
    if (!/^\d{3}$/.test(refundAccount?.bankCode || "") || !/^\d{1,16}$/.test(refundAccount?.accountNumber || "") || !refundAccount?.holderName?.trim()) fail("REFUND_ACCOUNT_REQUIRED", "입금된 가상계좌 환불에는 고객 환불계좌가 필요합니다.");
    Object.assign(fields, { RefundBankCd: refundAccount.bankCode, RefundAcctNo: refundAccount.accountNumber, RefundAcctNm: refundAccount.holderName.trim() });
  }
  return { url: "https://pg-api.nicepay.co.kr/webapi/cancel_process.jsp", fields };
}
function verifyCancellation(response, request, config, { netCancel = false } = {}) {
  credentials(config);
  const expectedAmount = request.fields.CancelAmt || request.fields.Amt;
  if (response.MID !== config.mid || amount(response.CancelAmt) !== Number(expectedAmount) || !response.TID?.startsWith(config.mid)
    || (response.Moid && request.fields.Moid && response.Moid !== request.fields.Moid)) fail("REFUND_MISMATCH", "취소 응답이 환불 요청과 일치하지 않습니다.");
  if (!verifyHash(response.Signature, sha256(response.TID + config.mid + response.CancelAmt + config.merchantKey))) fail("INVALID_SIGNATURE", "결제 취소 서명 검증에 실패했습니다.");
  if (!(netCancel ? ["2001"] : ["2001", "2211"]).includes(response.ResultCode)) fail("CANCEL_FAILED", "결제 취소가 완료되지 않았습니다.");
  // 2211 is accepted by the cancellation API, but never equate acceptance with bank receipt.
  return { status: response.ResultCode === "2211" ? "processing" : "cancelled", amount: amount(response.CancelAmt), transactionId: response.TID };
}

module.exports = { APPROVAL_CODES, sha256, verifyHash, amount, kstTimestamp, merchantConfig, gateway, checkoutFields, verifyAuthentication, approvalFields, verifyApproval, cancelFields, verifyCancellation };
