const {
  json,
  requireEnv,
  requireTossSecret,
  authenticatedUser,
  supabaseRequest,
  tossRequest,
} = require("./_server");

function daysUntil(dateText) {
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [year, month, day] = String(dateText).split("-").map(Number);
  return Math.floor((Date.UTC(year, month - 1, day) - todayUtc) / 86400000);
}

function refundPercentFor(reservation, policy) {
  if (reservation.status === "pending") return 100;
  const days = daysUntil(reservation.check_in_date || reservation.event_date);
  const fallbackPolicy = [
    { days_before: 14, refund_percent: 100 },
    { days_before: 7, refund_percent: 50 },
    { days_before: 3, refund_percent: 20 },
  ];
  return [...(Array.isArray(policy) && policy.length ? policy : fallbackPolicy)]
    .sort((a, b) => Number(b.days_before || 0) - Number(a.days_before || 0))
    .find((row) => days >= Number(row.days_before || 0))?.refund_percent || 0;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, message: "POST 요청만 사용할 수 있습니다." });
  try {
    requireEnv(["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
    requireTossSecret("stay");
    const user = await authenticatedUser(req.headers.authorization || "");
    if (!user?.id) return json(res, 401, { ok: false, message: "로그인이 만료되었습니다." });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const reservationId = String(body.reservationId || "").trim();
    const reason = String(body.reason || "이용자 예약 취소").trim().slice(0, 200);
    if (!reservationId) return json(res, 400, { ok: false, message: "예약 ID가 필요합니다." });

    const reservations = await supabaseRequest(
      `/rest/v1/reservations?select=id,customer_id,organization_id,status,event_date,check_in_date,total_amount,original_amount,businesses(refund_policy)&id=eq.${encodeURIComponent(reservationId)}&limit=1`,
    );
    const reservation = reservations?.[0];
    if (!reservation) return json(res, 404, { ok: false, message: "예약을 찾을 수 없습니다." });
    const permitted = reservation.organization_id
      ? await supabaseRequest("/rest/v1/rpc/is_organization_member", {
        method: "POST", body: JSON.stringify({ target_id: reservation.organization_id, target_user: user.id }),
      })
      : reservation.customer_id === user.id;
    if (permitted !== true) return json(res, 404, { ok: false, message: "예약을 찾을 수 없습니다." });
    if (!["pending", "confirmed"].includes(reservation.status)) return json(res, 409, { ok: false, message: "현재 상태에서는 취소할 수 없습니다." });

    const intents = await supabaseRequest(
      `/rest/v1/payment_intents?select=order_id,provider,payment_key,amount,original_amount,points_used,coupon_discount,status&kind=eq.stay&transaction_id=eq.${encodeURIComponent(reservationId)}&status=eq.confirmed&limit=1`,
    );
    const intent = intents?.[0];
    if (!intent) return json(res, 409, { ok: false, message: "연결된 결제 내역을 찾을 수 없습니다." });
    if (intent.provider !== "toss" || !intent.payment_key) return json(res, 409, { ok: false, message: "과거 테스트 결제는 운영팀에서 환불 상태를 확인해야 합니다." });

    const percent = Number(refundPercentFor(reservation, reservation.businesses?.refund_policy));
    const externalRefund = Math.floor(Number(intent.amount || 0) * percent / 100);
    const pointsRefund = Math.floor(Number(intent.points_used || 0) * percent / 100);
    let cancelResult = { status: "NO_REFUND", policyApplied: true };
    if (externalRefund > 0) {
      cancelResult = await tossRequest(`/v1/payments/${encodeURIComponent(intent.payment_key)}/cancel`, {
        method: "POST",
        headers: { "TossPayments-Idempotency-Key": `motf-user-cancel-${reservationId}-${percent}` },
        body: JSON.stringify({ cancelReason: reason, cancelAmount: externalRefund }),
      });
    }

    await supabaseRequest("/rest/v1/rpc/record_toss_refund", {
      method: "POST",
      body: JSON.stringify({
        target_transaction_kind: "stay",
        target_transaction_id: reservationId,
        external_refund_amount: externalRefund,
        points_refund_amount: pointsRefund,
        refund_percent: percent,
        refund_reason: reason,
        refund_state: "refunded",
        provider_response: cancelResult,
        requested_transaction_status: "cancelled",
      }),
    });

    return json(res, 200, {
      ok: true,
      refundPercent: percent,
      cashRefundAmount: externalRefund,
      pointRefundAmount: pointsRefund,
      message: percent > 0
        ? `${percent}% 환불이 처리되었습니다. 결제금 ${externalRefund.toLocaleString("ko-KR")}원${pointsRefund ? `과 ${pointsRefund.toLocaleString("ko-KR")}P` : ""}이 복구됩니다.`
        : "예약이 취소되었습니다. 현재 취소 규정상 환불 금액은 없습니다.",
    });
  } catch (error) {
    console.error("cancel-reservation", error);
    return json(res, error.statusCode || 500, { ok: false, code: error.code || "TOSS_CANCEL_ERROR", message: error.message || "예약 취소를 처리하지 못했습니다." });
  }
};
