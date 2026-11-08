const { json, requireEnv, authenticatedUser, supabaseRequest: db } = require('./_server');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const number = value => value !== null && value !== undefined && value !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const html = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const statusLabels = { pending: '승인 대기', confirmed: '확정', completed: '이용 완료', cancelled: '취소', rejected: '거절' };
const refundLabels = { none: '환불 없음', required: '환불 예정', processing: '환불 처리 중', refunded: '취소 처리 완료', failed: '환불 확인 필요' };
const methodLabels = { CARD: '카드', BANK: '계좌이체', VBANK: '가상계좌', CELLPHONE: '휴대폰', card: '카드', virtual_account: '가상계좌', '카드': '카드', '가상계좌': '가상계좌' };
function receiptUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /(^|\.)(tosspayments\.com|nicepay\.co\.kr)$/.test(url.hostname) ? url.href : null;
  } catch { return null; }
}
function source(row, intent, kind) {
  const paid = !!intent && ['confirmed', 'cancelled', 'partial_cancelled'].includes(intent.status) && !!intent.paid_at && number(intent.amount) !== null;
  const refunded = paid && intent.refund_status === 'refunded' && !!intent.refunded_at;
  const response = intent?.refund_response || {};
  // The stored total refund includes restored points. Never count those as cash returned.
  let cashRefund = null;
  if (refunded) {
    if (Number(intent.refund_amount || 0) === 0) cashRefund = 0;
    else if (number(response.CancelAmt) !== null) cashRefund = number(response.CancelAmt);
    else if (Array.isArray(response.cancels) && response.cancels.length && response.cancels.every(cancel => number(cancel.cancelAmount) !== null)) cashRefund = response.cancels.reduce((sum, cancel) => sum + number(cancel.cancelAmount), 0);
    else if (!Number(intent.points_used || 0)) cashRefund = number(intent.refund_amount);
    if (cashRefund !== null && cashRefund > Number(intent.amount)) cashRefund = null;
  }
  const gross = number(row.original_amount ?? row.total_amount);
  const items = kind === 'market' ? (row.market_order_items || []).map(item => ({
    name: item.item_name, quantity: number(item.quantity), price: number(item.unit_price), offeringId: item.offering_id,
  })) : [{ name: row.offering_name || '숙소 이용', quantity: 1, price: gross, offeringId: row.offering_id }];
  return {
    id: row.id, kind, organizationId: row.organization_id || null,
    name: row.businesses?.business_name || (kind === 'stay' ? '숙소' : '장보기'),
    statusLabel: statusLabels[row.status] || row.status,
    businessId: row.business_id, items, gross, status: row.status,
    eventDate: row.event_date || row.pickup_date || null, createdAt: row.created_at,
    paid, paidAt: paid ? intent.paid_at : null, cashPaid: paid ? number(intent.amount) : null,
    points: paid ? number(intent.points_used) || 0 : 0, coupon: paid ? number(intent.coupon_discount) || 0 : 0,
    refundStatus: intent?.refund_status || row.refund_status || 'none',
    refundLabel: refundLabels[intent?.refund_status || row.refund_status || 'none'] || '확인 필요',
    refundedAt: refunded ? intent.refunded_at : null, cashRefund,
    orderId: intent?.order_id || null, method: intent?.payment_method || null,
    methodLabel: methodLabels[intent?.payment_method] || intent?.payment_method || null,
    provider: intent?.provider || null,
    receiptUrl: paid ? receiptUrl(intent.payment_response?.receipt?.url || intent.payment_response?.receiptUrl) : null,
    evidenceId: `${kind === 'stay' ? 'S' : 'M'}-${row.id}`,
  };
}
function evidenceDocument(item, issuedAt) {
  const money = value => value === null ? '확인 필요' : `${Number(value).toLocaleString('ko-KR')}원`;
  const fields = [['증빙번호', item.evidenceId], ['발급 기준 시각', issuedAt], ['거래번호', item.id], ['결제 주문번호', item.orderId || '연결된 원결제 없음'], ['판매 업장', item.name], ['예약·주문 상태', item.statusLabel || item.status], ['결제 확인', item.paid ? '플랫폼 원장 결제 확인' : '결제 확인 전 (지출 증빙 아님)'], ['결제일시', item.paidAt || '확인 전'], ['결제수단', item.methodLabel || item.method || '미확인'], ['상품 금액', money(item.gross)], ['포인트 사용', money(item.points)], ['쿠폰 할인', money(item.coupon)], ['실제 결제금액', money(item.cashPaid)], ['환불 상태', item.refundLabel || item.refundStatus], ['원장상 환불 완료일시', item.refundedAt || '-'], ['원장상 취소금액 (현금)', item.refundedAt ? money(item.cashRefund) : '완료 확인 전']];
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>모티프 주문·결제내역서</title><style>body{font:14px/1.6 'Malgun Gothic',sans-serif;color:#202720;max-width:860px;margin:40px auto;padding:0 24px}h1{font-size:24px}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{padding:10px;text-align:left;border-bottom:1px solid #daddd6}th{background:#f2f4ef;width:34%}.notice{padding:16px;background:#f7f5e9}@media print{body{margin:0}a{color:inherit}}</style></head><body><h1>모티프 주문·결제내역서</h1><p class="notice">플랫폼에 저장된 주문 및 결제 기록입니다. 세금계산서·현금영수증·카드 매출전표가 아니며, 은행 입출금 내역을 대신하지 않습니다. 취소 승인의 실제 환급 시점은 결제수단에 따라 다릅니다.</p><table>${fields.map(([key, value]) => `<tr><th>${html(key)}</th><td>${html(value)}</td></tr>`).join('')}</table><h2>주문 품목</h2><table><thead><tr><th>품목</th><th>단가</th><th>수량</th><th>상품 합계</th></tr></thead><tbody>${item.items.map(line => `<tr><td>${html(line.name)}</td><td>${money(line.price)}</td><td>${html(line.quantity ?? '미확인')}</td><td>${money(line.price !== null && line.quantity !== null ? line.price * line.quantity : null)}</td></tr>`).join('')}</tbody></table><p>품목 합계와 실제 결제액은 할인·포인트·취소에 따라 다를 수 있습니다.</p>${item.receiptUrl ? `<p><a href="${html(item.receiptUrl)}" rel="noopener noreferrer">PG 공식 영수증 보기</a></p>` : '<p>공식 영수증 링크가 저장되어 있지 않습니다. 카드사·결제사에서 별도로 발급받아 주세요.</p>'}</body></html>`;
}
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return json(res, 405, { ok: false });
  try {
    requireEnv(['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
    const user = await authenticatedUser(req.headers.authorization || '');
    if (!user?.id) return json(res, 401, { ok: false, message: '로그인이 필요합니다.' });
    let input = req.body || {};
    if (typeof input === 'string') { if (input.length > 65536) throw new Error('요청이 너무 큽니다.'); input = JSON.parse(input); }
    const oid = input.organizationId || null;
    if (oid && !UUID.test(oid)) throw new Error('단체 정보를 확인해주세요.');
    if (oid && await db('/rest/v1/rpc/is_organization_member', { method: 'POST', body: JSON.stringify({ target_id: oid, target_user: user.id }) }) !== true) return json(res, 403, { ok: false, message: '단체 거래에 접근할 수 없습니다.' });
    const scope = oid ? `organization_id=eq.${oid}` : `customer_id=eq.${user.id}&organization_id=is.null`;
    const selections = input.selections;
    const transactionIds = input.transactionIds;
    if (transactionIds !== undefined && (!Array.isArray(transactionIds) || transactionIds.length > 200 || transactionIds.some(id => !UUID.test(id)))) throw new Error('선택한 거래를 확인해주세요. 한 번에 최대 200건입니다.');
    if (selections !== undefined && (!Array.isArray(selections) || selections.length > 200 || selections.some(item => !['stay', 'market'].includes(item.kind) || !UUID.test(item.id)))) throw new Error('선택한 거래를 확인해주세요. 한 번에 최대 200건입니다.');
    const all = [];
    for (const kind of ['stay', 'market']) {
      const ids = transactionIds || selections?.filter(item => item.kind === kind).map(item => item.id);
      if (ids && !ids.length) continue;
      const table = kind === 'stay' ? 'reservations' : 'market_orders';
      const rows = await db(`/rest/v1/${table}?${scope}${ids ? `&id=in.(${ids.join(',')})` : ''}&select=*,businesses(business_name)${kind === 'market' ? ',market_order_items(item_name,quantity,unit_price,offering_id)' : ''}&order=created_at.desc&limit=501`);
      if (rows.length > 500) throw new Error('거래가 많습니다. 이용 내역에서 200건 이하로 선택해주세요.');
      if (!transactionIds && ids && rows.length !== new Set(ids).size) return json(res, 403, { ok: false, message: '접근할 수 없는 거래가 포함되어 있습니다.' });
      if (!rows.length) continue;
      const intents = [];
      for (let index = 0; index < rows.length; index += 100) {
        intents.push(...await db(`/rest/v1/payment_intents?kind=eq.${kind}&transaction_id=in.(${rows.slice(index, index + 100).map(row => row.id).join(',')})&select=transaction_id,order_id,status,amount,points_used,coupon_discount,paid_at,refund_status,refund_amount,refunded_at,refund_response,payment_method,provider,payment_response&order=created_at.desc&limit=300`));
      }
      for (const row of rows) all.push(source(row, intents.find(intent => intent.transaction_id === row.id), kind));
    }
    if (transactionIds && new Set(all.map(row => row.id)).size !== new Set(transactionIds).size) return json(res, 403, { ok: false, message: '접근할 수 없는 거래가 포함되어 있습니다.' });
    const issuedAt = new Date().toISOString();
    return json(res, 200, { ok: true, issuedAt, sources: all, documents: input.includeEvidence === true ? all.map(item => ({ id: item.evidenceId, fileName: `${item.evidenceId}.html`, html: evidenceDocument(item, issuedAt) })) : [] });
  } catch (error) {
    return json(res, error.statusCode || 400, { ok: false, message: error.message || '거래 내역을 확인하지 못했습니다.' });
  }
};
module.exports.source = source;
module.exports.receiptUrl = receiptUrl;
module.exports.evidenceDocument = evidenceDocument;
