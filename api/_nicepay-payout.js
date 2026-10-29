const { sha256, kstTimestamp, amount } = require("./_nicepay");

const SID = Object.freeze({ balance: "0101001", seller: "0105001", request: "0102001", cancel: "0103001", results: "0101002" });
function reject(code, message) { throw Object.assign(new Error(message), { code, statusCode: 409 }); }
function validDate(value) {
  if (!/^\d{8}$/.test(value)) reject("INVALID_DATE", "지급일은 YYYYMMDD 형식이어야 합니다.");
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const parsed = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) reject("INVALID_DATE", "존재하지 않는 지급일입니다.");
  return parsed;
}
function assertPayoutDate(date, now, isBusinessDay) {
  const parsed = validDate(date);
  const local = kstTimestamp(now);
  if (date < local.slice(0, 8) || parsed.getUTCDay() === 0 || parsed.getUTCDay() === 6) reject("INVALID_PAYOUT_DAY", "지급일은 오늘 이후 영업일이어야 합니다.");
  // A maintained Korean banking-holiday calendar must be injected; weekends alone are not sufficient.
  if (typeof isBusinessDay !== "function" || isBusinessDay(date) !== true) reject("BUSINESS_DAY_NOT_VERIFIED", "은행 영업일 확인이 필요합니다.");
  if (date === local.slice(0, 8) && local.slice(8) >= "103000") reject("PAYOUT_CUTOFF", "당일 지급 요청·취소는 오전 10:30 전에만 가능합니다.");
}
function buildPayoutRequest(operation, input, config, { now = new Date(), isBusinessDay } = {}) {
  const sid = SID[operation];
  if (!sid || !/^[a-z\d]{10}$/i.test(config?.mid || "") || !config?.merchantKey) reject("PAYOUT_NOT_CONFIGURED", "지급대행 MID와 KEY를 확인해주세요.");
  const body = { mid: config.mid };
  const local = kstTimestamp(now);
  if (["seller", "request", "cancel"].includes(operation) && (local.slice(8, 10) >= "23" || local.slice(8, 10) < "01")) reject("BANK_MAINTENANCE", "은행 전환 시간 23:00~01:00에는 처리할 수 없습니다.");
  if (["seller", "request", "cancel"].includes(operation) && !/^[a-z\d]{1,50}$/i.test(input?.subId || "")) reject("INVALID_SELLER", "나이스 서브몰 ID는 영문·숫자로 등록해야 합니다.");
  if (operation === "seller") {
    if (!/^[01]$/.test(input.reqType) || !/^\d{10}$/.test(input.subCoNo || "") || !/^\d{3}$/.test(input.bankCd || "")
      || !/^\d{1,30}$/.test(input.accntNo || "") || !input.subNm?.trim() || !input.accntNm?.trim()) reject("INVALID_SELLER", "사업자번호·은행·계좌·예금주 정보를 확인해주세요.");
    for (const key of ["subId", "subNm", "subCoNo", "bankCd", "accntNo", "accntNm", "reqType"]) body[key] = input[key];
    if (input.memo) body.memo = input.memo;
  }
  if (["request", "cancel", "results"].includes(operation)) {
    body.settlmntDt = String(input?.settlmntDt || "");
    validDate(body.settlmntDt);
    if (input.subId) {
      if (!/^[a-z\d]{1,50}$/i.test(input.subId)) reject("INVALID_SELLER", "서브몰 ID를 확인해주세요.");
      body.subId = input.subId;
    }
  }
  if (["request", "cancel"].includes(operation)) assertPayoutDate(body.settlmntDt, now, isBusinessDay);
  if (operation === "request") {
    const requested = amount(input.settlmntAmt);
    if (!Number.isSafeInteger(input.availableBalance) || !Number.isSafeInteger(input.reservedAmount) || input.reservedAmount < 0
      || requested > input.availableBalance - input.reservedAmount) reject("INSUFFICIENT_BALANCE", "다른 지급 요청을 제외한 가용 잔액이 부족합니다.");
    if (!input.operationClaimed) reject("OPERATION_NOT_CLAIMED", "DB에서 중복 지급 방지 잠금을 먼저 확보해야 합니다.");
    body.settlmntAmt = String(requested);
    body.dupChkYn = "Y";
    // PDF accountDesc and online accntDesc disagree; omit the optional field until NICE confirms it.
  }
  if (operation === "cancel") {
    if (!/^\d{1,20}$/.test(String(input.seq || ""))) reject("INVALID_SEQUENCE", "원 지급 요청의 seq가 필요합니다.");
    body.seq = String(input.seq);
  }
  if (operation === "results" && (body.settlmntDt > local.slice(0, 8) || (body.settlmntDt === local.slice(0, 8) && local.slice(8) < "160000"))) reject("RESULTS_NOT_READY", "지급 결과는 지급일 16시 이후 조회해주세요.");
  body.encKey = sha256(sid + config.mid + local + config.merchantKey);
  return { url: "https://data.nicepay.co.kr/om/api", header: { sid, trDtm: local, gubun: "S", resCode: "", resMsg: "" }, body };
}
function verifyPayoutResponse(response, request) {
  if (response?.header?.sid !== request.header.sid || response?.header?.gubun !== "R") reject("PAYOUT_RESPONSE_MISMATCH", "지급대행 응답 전문이 일치하지 않습니다.");
  if (response.header.resCode !== "0000") reject("PAYOUT_REJECTED", "나이스 지급대행 요청이 거절되었습니다. 관리자에서 결과코드를 확인해주세요.");
  if (response.body?.mid && response.body.mid !== request.body.mid) reject("PAYOUT_RESPONSE_MISMATCH", "지급대행 가맹점이 일치하지 않습니다.");
  if (request.header.sid === SID.request) {
    if (!/^\d{1,20}$/.test(String(response.body?.seq || "")) || response.body?.subId !== request.body.subId
      || response.body?.settlmntDt !== request.body.settlmntDt || Number(response.body?.settlmntAmt) !== Number(request.body.settlmntAmt)) reject("PAYOUT_RESPONSE_MISMATCH", "지급대행 요청 결과를 재확인해야 합니다.");
    return { state: "requested", seq: String(response.body.seq) };
  }
  return response.body;
}
function payoutResultState(status) {
  return ({ "요청": "requested", "성공": "succeeded", "실패": "failed", "재요청 진행중": "processing", "삭제": "cancelled" })[String(status || "").trim()] || "unknown";
}
module.exports = { SID, validDate, assertPayoutDate, buildPayoutRequest, verifyPayoutResponse, payoutResultState };
