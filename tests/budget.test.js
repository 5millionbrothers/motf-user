const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../budget-model');
const api = require('../api/budget-sources');
const tx = '33333333-3333-4333-8333-333333333333';
const user = '11111111-1111-4111-8111-111111111111';
const org = '22222222-2222-4222-8222-222222222222';
const draft = () => ({ meta: { title: '테스트 MT 예결산', start: '2026-11-01', end: '2026-11-30', opening: 0 }, options: { ...M.defaults }, entries: [], selected: [], planned: [] });
const row = () => ({ id: tx, kind: 'stay', name: '테스트 숙소', gross: 100000, paid: true, paidAt: '2026-11-02T00:00:00Z', cashPaid: 90000, points: 10000, coupon: 0, items: [{ name: '객실', price: 100000, quantity: 1, offeringId: 'room' }], refundStatus: 'none', status: 'pending', evidenceId: 'S-test' });
test('budget: quantity × unit price, explicit lump sum, unknown and zero remain distinct', () => {
  const d = draft();
  d.entries = [{ ...M.blankEntry('income'), name: '참가비', price: 35000, quantity: 32 }, { ...M.blankEntry(), name: '지원 물품', price: 0, quantity: 2 }, { ...M.blankEntry(), name: '예정', price: '', quantity: 1 }, { ...M.blankEntry(), name: '정액', price: '', quantity: 1, budget: 12000 }];
  const r = M.build(d);
  assert.equal(r.errors.length, 0); assert.equal(r.totals.budgetIncome, 1120000); assert.equal(r.totals.budgetExpense, 12000);
  assert.equal(r.budget[1].budget, 0); assert.equal(r.budget[2].budget, null); assert.equal(r.ledger.length, 0);
});
test('budget: unpaid and pending refunds never become actual cash', () => {
  const d = draft(); d.selected = [`stay:${tx}`]; const s = row(); s.paid = false; s.paidAt = null; s.cashPaid = null; s.refundStatus = 'processing';
  const r = M.build(d, [s]); assert.equal(r.ledger.length, 0); assert.equal(r.totals.budgetExpense, 100000);
});
test('budget: gross and actual paid, completed cash refund and point restoration are separate', () => {
  const d = draft(); d.selected = [`stay:${tx}`]; const s = row(); Object.assign(s, { refundStatus: 'refunded', refundedAt: '2026-11-03T00:00:00Z', cashRefund: 45000 });
  const r = M.build(d, [s]); assert.equal(r.totals.cashOut, 90000); assert.equal(r.totals.cashIn, 45000); assert.equal(r.totals.balance, -45000);
  assert.equal(r.checklist[0].delivered, false);
});
test('budget: cash refund with unknown point split is not guessed', () => {
  const s = api.source({ id: tx, original_amount: 100000, offering_name: '객실' }, { status: 'partial_cancelled', paid_at: '2026-11-01', amount: 90000, points_used: 10000, refund_status: 'refunded', refunded_at: '2026-11-02', refund_amount: 50000 }, 'stay');
  assert.equal(s.cashRefund, null);
  assert.equal(api.source({ id: tx }, { status: 'cancelled', paid_at: '2026-11-01', amount: 90000, points_used: 10000, refund_status: 'refunded', refunded_at: '2026-11-02', refund_amount: 50000, refund_response: { CancelAmt: '45000' } }, 'stay').cashRefund, 45000);
});
test('budget: period uses KST payment/refund dates independently, not travel date', () => {
  const d = draft(); d.meta.start = '2026-11-03'; d.selected = [`stay:${tx}`];
  const s = { ...row(), paidAt: '2026-11-02T14:59:59Z', refundedAt: '2026-11-02T15:00:00Z', refundStatus: 'refunded', cashRefund: 90000 };
  const r = M.build(d, [s]); assert.equal(r.totals.cashOut, 0); assert.equal(r.totals.cashIn, 90000);
});
test('budget: actual amount needs transaction date; negative and invalid amounts rejected', () => {
  const d = draft(); d.entries = [{ ...M.blankEntry(), name: '수기', actual: 4000, price: -1 }];
  const r = M.build(d); assert.equal(r.errors.length, 2);
});
test('budget: transfers are ledger movements, not expense/income budgets', () => {
  const d = draft(); d.entries = [{ ...M.blankEntry('transfer_out'), name: '잔액 이체', actual: 20000, budget: 20000, date: '2026-11-05' }];
  const r = M.build(d); assert.equal(r.totals.budgetExpense, 0); assert.equal(r.totals.cashOut, 20000);
});
test('budget: missing opening balance and zero-denominator ratios stay blank', () => {
  const d = draft(); d.meta.opening = ''; d.entries = [{ ...M.blankEntry(), name: '수기', budget: 0, actual: 4000, date: '2026-11-02' }];
  const r = M.build(d); assert.equal(r.ledger[0].balance, null);
  const s = M.specs(r).find(sheet => sheet.name === M.sheets.summary); assert.equal(s.rows[6][7], null);
});
test('budget: selected MT item and matching purchase cannot double count', () => {
  const d = draft(); d.selected = [`stay:${tx}`]; d.planned = ['p'];
  const r = M.build(d, [row()], [{ id: 'p', reference_id: 'room', title: '객실', item_kind: 'stay', amount: 100000, quantity: 1 }]); assert.ok(r.errors.some(error => error.includes('겹칩니다')));
});
test('budget: summary preserves different account codes in the same category', () => {
  const d = draft(); d.entries = ['지-111', '지-112'].map(code => ({ ...M.blankEntry(), name: code, category: '기타', code, budget: 10000 }));
  const s = M.specs(M.build(d)).find(sheet => sheet.name === M.sheets.summary);
  assert.equal(s.rows.filter(row => String(row[3]).startsWith('기타 /')).length, 2);
});
test('budget: optional sheets and columns obey selected checkboxes', () => {
  const d = draft(); d.options = { ...M.defaults, budget: false, checklist: false, summary: false, evidence: true, noncash: false };
  const specs = M.specs(M.build(d)); assert.deepEqual(specs.map(s => s.name), ['결산 세부내역', '증빙 목록']);
  assert.equal(specs[0].rows[5].includes('포인트 사용'), false);
});
test('budget: official URLs are allowlisted and document escapes injected HTML', () => {
  assert.equal(api.receiptUrl('https://nicepay.co.kr.evil.test/a'), null); assert.equal(api.receiptUrl('javascript:alert(1)'), null);
  const doc = api.evidenceDocument({ ...row(), name: '<script>alert(1)</script>' }, '2026-11-09');
  assert.equal(doc.includes('<script>'), false); assert.ok(doc.includes('세금계산서')); assert.ok(doc.includes('공식 영수증 링크가 저장되어 있지 않습니다'));
});
test('quick budget: one reference sheet by default, with no entered income or made-up opening balance', () => {
  const report = M.quickReport({}, [row()]);
  assert.equal(report.errors.length, 0);
  const sheets = M.specs(report);
  assert.deepEqual(sheets.map(item => item.name), ['예결산안']);
  assert.equal(sheets[0].rows.some(values => values.includes('기초 잔액')), false);
  assert.equal(sheets[0].rows.find(values => values[3] === '참가비')[4], null);
});
test('quick budget: category checkboxes and optional evidence are respected, checklist is removed', () => {
  const market = { ...row(), id: 'market', kind: 'market' };
  const report = M.quickReport({}, [row(), market], { stay: false, market: true, checklist: true, evidence: true });
  assert.equal(report.sources.length, 1); assert.equal(report.sources[0].kind, 'market');
  assert.deepEqual(M.specs(report).map(item => item.name), ['예결산안', '증빙 목록']);
});
test('quick budget: matching paid rooms replace MT estimates and other planned costs stay estimates', () => {
  const report = M.quickReport({ project: { title: '우리 MT', items: [{ id: 'room', item_kind: 'stay', reference_id: 'room', amount: 100000, quantity: 1, title: '객실 후보' }, { id: 'bus', item_kind: 'other', amount: 200000, quantity: 1, title: '교통비' }] } }, [row()]);
  assert.equal(report.errors.length, 0); assert.equal(report.budget.length, 2); assert.equal(report.totals.budgetExpense, 300000);
  assert.equal(report.totals.cashOut, 90000);
});
test('quick budget: a multi-item order reports its actual payment and refund once', () => {
  const market = { ...row(), kind: 'market', items: [{ name: '고기', price: 24000, quantity: 4 }, { name: '음료', price: 4000, quantity: 1 }], refundStatus: 'refunded', refundedAt: '2026-11-03', cashRefund: 10000 };
  const spec = M.specs(M.quickReport({}, [market]))[0];
  assert.equal(spec.rows.filter(row => row[7] === 90000).length, 1);
  assert.equal(spec.rows.filter(row => row[8] === 10000).length, 1);
  assert.ok(spec.merges.some(value => /^H\d+:H\d+$/.test(value)));
});
async function invoke(body, auth = 'Bearer fixture') {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(value) { this.data = JSON.parse(value); } };
  await api({ method: 'POST', headers: { authorization: auth }, body }, res); return res;
}
test('budget API: authentication, scope isolation, unauthorized selections, and no secret exposure', async () => {
  const previous = global.fetch, env = {};
  for (const [key, value] of Object.entries({ SUPABASE_URL: 'https://fixture.test', SUPABASE_PUBLISHABLE_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: 'private' })) { env[key] = process.env[key]; process.env[key] = value; }
  const requests = []; let allowSelected = false;
  global.fetch = async (url, options) => {
    const target = new URL(url); requests.push(target);
    let value = [];
    if (target.pathname === '/auth/v1/user') value = { id: user };
    if (target.pathname.endsWith('/is_organization_member')) value = false;
    if (target.pathname.endsWith('/reservations') && (!target.searchParams.has('id') || allowSelected)) value = [{ id: tx, customer_id: user, original_amount: 100000, businesses: { business_name: '테스트' } }];
    if (target.pathname.endsWith('/payment_intents')) value = [{ transaction_id: tx, status: 'confirmed', paid_at: '2026-11-02', amount: 90000, points_used: 10000, payment_response: { MerchantKey: 'LEAK', Signature: 'SECRET' } }];
    return new Response(JSON.stringify(value), { status: 200 });
  };
  try {
    assert.equal((await invoke({}, '')).statusCode, 401);
    assert.equal((await invoke({ organizationId: org })).statusCode, 403);
    assert.equal((await invoke({ selections: [{ kind: 'stay', id: tx }] })).statusCode, 403);
    assert.equal((await invoke({ transactionIds: [tx] })).statusCode, 403);
    const beforeEmpty = requests.length;
    assert.deepEqual((await invoke({ transactionIds: [] })).data.sources, []);
    assert.equal(requests.slice(beforeEmpty).some(url => url.pathname.endsWith('/reservations')), false);
    allowSelected = true;
    assert.equal((await invoke({ transactionIds: [tx] })).data.sources.length, 1);
    const res = await invoke({}); assert.equal(res.statusCode, 200);
    assert.equal(JSON.stringify(res.data).includes('SECRET'), false); assert.equal(JSON.stringify(res.data).includes('LEAK'), false);
    assert.ok(requests.filter(url => url.pathname.endsWith('/reservations')).every(url => url.searchParams.get('customer_id') === `eq.${user}` && url.searchParams.get('organization_id') === 'is.null'));
  } finally { global.fetch = previous; for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
