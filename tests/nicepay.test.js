const test = require("node:test");
const assert = require("node:assert/strict");
const pg = require("../api/_nicepay");
const payout = require("../api/_nicepay-payout");
const config = { mid: "nictest00m", merchantKey: "unit-test-only-not-a-real-key" };
const intent = { order_id: "motf-12345", amount: 950000, original_amount: 1000000 };
const now = new Date("2026-10-29T00:00:00Z");
const tid = config.mid + "12345678901234567890";
const authentication = {
  AuthResultCode: "0000", MID: config.mid, Moid: intent.order_id, Amt: "000000950000", AuthToken: "test-token",
  TxTid: tid, PayMethod: "CARD", NextAppURL: "https://dc2-api.nicepay.co.kr/webapi/pay_process.jsp",
  NetCancelURL: "https://dc2-api.nicepay.co.kr/webapi/cancel_process.jsp",
};
authentication.Signature = pg.sha256(authentication.AuthToken + config.mid + authentication.Amt + config.merchantKey);
function approval(method = "CARD") {
  const response = { MID: config.mid, Moid: intent.order_id, TID: tid, Amt: "000000950000", PayMethod: method, ResultCode: pg.APPROVAL_CODES[method] };
  response.Signature = pg.sha256(tid + config.mid + response.Amt + config.merchantKey);
  return response;
}
function authenticationFor(method) { return { ...authentication, PayMethod: method }; }
function rejects(fn, code) { assert.throws(fn, (error) => error.code === code); }

test("KST request clock is independent of server timezone", () => {
  assert.equal(pg.kstTimestamp(now), "20261029090000");
  assert.equal(pg.kstTimestamp(new Date("2026-10-29T15:00:00Z")), "20261030000000");
});
test("checkout uses the existing single DB order ID and discounted payable amount", () => {
  const fields = pg.checkoutFields(intent, config, { method: "CARD", returnUrl: "https://motf.co.kr/api/nicepay-return", now });
  assert.equal(fields.Moid, intent.order_id);
  assert.equal(fields.Amt, "950000");
  assert.equal(fields.SignData, pg.sha256("20261029090000" + config.mid + "950000" + config.merchantKey));
  assert.equal(JSON.stringify(fields).includes(config.merchantKey), false);
});
test("no cross-kind credential fallback", () => {
  rejects(() => pg.merchantConfig("market", { NICEPAY_STAY_MID: config.mid, NICEPAY_STAY_MERCHANT_KEY: config.merchantKey }), "NICEPAY_NOT_CONFIGURED");
  rejects(() => pg.merchantConfig("other", {}), "INVALID_KIND");
});
test("shared MID and MerchantKey configure both accommodation and market", () => {
  const environment = { NICEPAY_MID: config.mid, NICEPAY_MERCHANT_KEY: config.merchantKey };
  for (const kind of ["stay", "market"]) {
    assert.deepEqual(pg.merchantConfig(kind, environment), config);
    assert.equal(pg.isConfigured(kind, environment), true);
  }
});
test("incomplete common credentials never mix with a legacy key", () => {
  const environment = { NICEPAY_MID: config.mid, NICEPAY_STAY_MERCHANT_KEY: config.merchantKey };
  rejects(() => pg.merchantConfig("stay", environment), "NICEPAY_NOT_CONFIGURED");
  assert.equal(pg.isConfigured("stay", environment), false);
});
test("the common credential pair takes precedence over previous per-kind settings", () => {
  const environment = { NICEPAY_MID: config.mid, NICEPAY_MERCHANT_KEY: config.merchantKey, NICEPAY_MARKET_MID: "oldtest00m", NICEPAY_MARKET_MERCHANT_KEY: "old-key" };
  assert.deepEqual(pg.merchantConfig("market", environment), config);
});
for (const badAmount of [0, -10, 3.5, "1e3", "1,000", "", NaN, Infinity]) {
  test("reject invalid amount " + String(badAmount), () => rejects(() => pg.amount(badAmount), "INVALID_AMOUNT"));
}
test("gross over existing review limit cannot bypass it with points", () => {
  rejects(() => pg.checkoutFields({ ...intent, original_amount: 10000001 }, config, { method: "CARD", returnUrl: "https://motf.co.kr/api/nicepay-return" }), "PAYMENT_AMOUNT_LIMIT_EXCEEDED");
});
test("authentication preserves padded raw amount for signature verification", () => {
  assert.equal(pg.verifyAuthentication(authentication, intent, config), authentication);
  assert.equal(pg.approvalFields(authentication, intent, config, { now }).fields.Amt, authentication.Amt);
});
for (const change of [{ MID: "other0000m" }, { Moid: "other-order" }, { Amt: "950001" }, { Signature: "0".repeat(64) }, { TxTid: "invalid" }]) {
  test("authentication rejects mismatch " + Object.keys(change)[0], () => assert.throws(() => pg.verifyAuthentication({ ...authentication, ...change }, intent, config)));
}
for (const url of ["http://dc1-api.nicepay.co.kr/webapi/pay_process.jsp", "https://dc1-api.nicepay.co.kr.evil.example/webapi/pay_process.jsp", "https://dc1-api.nicepay.co.kr/webapi/pay_process.jsp?redirect=evil", "https://127.0.0.1/webapi/pay_process.jsp"]) {
  test("reject SSRF destination " + url, () => rejects(() => pg.verifyAuthentication({ ...authentication, NextAppURL: url }, intent, config), "UNTRUSTED_GATEWAY"));
}
for (const method of ["CARD", "BANK", "CELLPHONE"]) {
  test(method + " verified approval is paid", () => assert.equal(pg.verifyApproval(approval(method), intent, config, authenticationFor(method)).status, "paid"));
}
test("virtual account issuance is NEVER paid", () => assert.equal(pg.verifyApproval(approval("VBANK"), intent, config, authenticationFor("VBANK")).status, "awaiting_deposit"));
test("approval must match the authenticated transaction and payment method", () => {
  rejects(() => pg.verifyApproval({ ...approval(), TID: config.mid + "0".repeat(20) }, intent, config, authentication), "PAYMENT_MISMATCH");
  rejects(() => pg.verifyApproval(approval("BANK"), intent, config, authentication), "PAYMENT_MISMATCH");
  rejects(() => pg.verifyApproval({ ...approval(), ResultCode: "0000" }, intent, config, authentication), "APPROVAL_FAILED");
});
test("network cancellation uses the callback DC and never reapproves", () => {
  const request = pg.approvalFields(authentication, intent, config, { netCancel: true, now });
  assert.equal(request.url, authentication.NetCancelURL);
  assert.equal(request.fields.NetCancel, "1");
});
const payment = { provider: "nicepay", mid: config.mid, tid, method: "CARD", status: "paid", originalAmount: 950000, remainingAmount: 950000 };
test("full refund and partial refund use distinct cancellation modes", () => {
  const options = { cancellationId: "refund-123", reason: "고객 취소", now };
  assert.equal(pg.cancelFields(payment, config, { ...options, cancelAmount: 950000 }).fields.PartialCancelCode, "0");
  assert.equal(pg.cancelFields(payment, config, { ...options, cancelAmount: 475000 }).fields.PartialCancelCode, "1");
  assert.equal(pg.cancelFields({ ...payment, remainingAmount: 475000 }, config, { ...options, cancelAmount: 475000 }).fields.PartialCancelCode, "1");
});
test("over-refund, foreign provider and missing refund accounts are blocked", () => {
  const options = { cancellationId: "refund-123", reason: "고객 취소", cancelAmount: 950000, now };
  rejects(() => pg.cancelFields({ ...payment, remainingAmount: 1 }, config, options), "EXCESS_REFUND");
  rejects(() => pg.cancelFields({ ...payment, provider: "toss" }, config, options), "WRONG_PROVIDER");
  rejects(() => pg.cancelFields({ ...payment, method: "VBANK" }, config, options), "REFUND_ACCOUNT_REQUIRED");
});
test("refund acceptance is not falsely shown as bank receipt", () => {
  const request = pg.cancelFields(payment, config, { cancellationId: "refund123", reason: "test", cancelAmount: 950000, now });
  const result = { MID: config.mid, Moid: "refund123", TID: tid, CancelAmt: "000000950000", ResultCode: "2211" };
  result.Signature = pg.sha256(result.TID + result.MID + result.CancelAmt + config.merchantKey);
  assert.equal(pg.verifyCancellation(result, request, config).status, "processing");
  rejects(() => pg.verifyCancellation(result, request, config, { netCancel: true }), "CANCEL_FAILED");
});
const payoutInput = { subId: "business123", settlmntDt: "20261029", settlmntAmt: 970000, availableBalance: 1000000, reservedAmount: 0, operationClaimed: true };
const calendar = { now, isBusinessDay: date => date === "20261029" };
test("payout uses UTF-8 JSON envelope and SHA256 encKey", () => {
  const request = payout.buildPayoutRequest("request", payoutInput, config, calendar);
  assert.equal(request.body.dupChkYn, "Y");
  assert.equal(request.body.encKey, pg.sha256("0102001" + config.mid + "20261029090000" + config.merchantKey));
  assert.equal(Object.hasOwn(request.body, "availableBalance"), false);
});
test("balance, lock, holiday and cutoff checks fail closed", () => {
  rejects(() => payout.buildPayoutRequest("request", { ...payoutInput, availableBalance: 950000 }, config, calendar), "INSUFFICIENT_BALANCE");
  rejects(() => payout.buildPayoutRequest("request", { ...payoutInput, reservedAmount: 50000 }, config, calendar), "INSUFFICIENT_BALANCE");
  rejects(() => payout.buildPayoutRequest("request", { ...payoutInput, operationClaimed: false }, config, calendar), "OPERATION_NOT_CLAIMED");
  rejects(() => payout.buildPayoutRequest("request", payoutInput, config, { now }), "BUSINESS_DAY_NOT_VERIFIED");
  rejects(() => payout.buildPayoutRequest("request", payoutInput, config, { ...calendar, now: new Date("2026-10-29T01:30:00Z") }), "PAYOUT_CUTOFF");
  rejects(() => payout.buildPayoutRequest("request", { ...payoutInput, settlmntDt: "20261031" }, config, { now, isBusinessDay: () => true }), "INVALID_PAYOUT_DAY");
  rejects(() => payout.validDate("20260230"), "INVALID_DATE");
});
test("payout response success is requested, not succeeded", () => {
  const request = payout.buildPayoutRequest("request", payoutInput, config, calendar);
  const response = { header: { sid: "0102001", gubun: "R", resCode: "0000" }, body: { mid: config.mid, seq: "98765", subId: payoutInput.subId, settlmntDt: payoutInput.settlmntDt, settlmntAmt: 970000 } };
  assert.deepEqual(payout.verifyPayoutResponse(response, request), { state: "requested", seq: "98765" });
  rejects(() => payout.verifyPayoutResponse({ ...response, body: { ...response.body, settlmntAmt: 100 } }, request), "PAYOUT_RESPONSE_MISMATCH");
});
test("results are unavailable until 16:00 KST; unknown states stay unknown", () => {
  rejects(() => payout.buildPayoutRequest("results", payoutInput, config, calendar), "RESULTS_NOT_READY");
  assert.equal(payout.payoutResultState("성공"), "succeeded");
  assert.equal(payout.payoutResultState("요청"), "requested");
  assert.equal(payout.payoutResultState("재요청 진행중"), "processing");
  assert.equal(payout.payoutResultState("new-future-status"), "unknown");
});
