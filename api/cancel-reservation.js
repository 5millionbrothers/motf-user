const refund = require("./refund-payment");
const { json } = require("./_server");
module.exports = async function handler(req, res) {
  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}; }
  catch { return json(res, 400, { ok: false, message: "취소 요청 형식을 확인해주세요." }); }
  req.body = { kind: "stay", id: body.reservationId, reason: body.reason, refundAccount: body.refundAccount, action: "user_cancel" };
  return refund(req, res);
};
