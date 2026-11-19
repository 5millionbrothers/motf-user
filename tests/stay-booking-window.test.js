const {test} = require('node:test');
const assert = require('node:assert/strict');
const {limits, range} = require('../stay-booking-window');
const {refundPercent} = require('../api/refund-payment');
const {receiptAttachments} = require('../api/budget-sources');

test('stay months open on the Seoul midnight boundary instead of a rolling 90 days', () => {
  const before = new Date('2026-11-30T14:59:59Z');
  const after = new Date('2026-11-30T15:00:00Z');
  assert.equal(limits(before).lastNight, '2027-02-28');
  assert.deepEqual(range('2027-03-31','2027-04-01',before), {ok:false, opens:'2026-12-01'});
  assert.deepEqual(limits(after), {today:'2026-12-01',lastNight:'2027-03-31',lastCheckout:'2027-04-01'});
  assert.deepEqual(range('2027-03-31','2027-04-01',after), {ok:true});
  assert.deepEqual(range('2027-03-31','2027-04-02',after), {ok:false, opens:'2027-01-01'});
  assert.deepEqual(range('2027-03-31','2027-04-02',new Date('2026-12-31T15:00:00Z')), {ok:true});
});

test('past, impossible and zero-night stays are rejected; leap-day nights are supported', () => {
  const after = new Date('2027-11-30T15:00:00Z');
  assert.deepEqual(range('2028-02-29','2028-03-01',after), {ok:true});
  assert.deepEqual(range('2028-02-30','2028-03-01',after), {ok:false});
  assert.deepEqual(range('2027-11-30','2027-12-01',after), {ok:false});
  assert.deepEqual(range('2027-12-01','2027-12-01',after), {ok:false});
});

test('historical fixed snapshots retain the disclosed 30/29 and 15/14 day boundaries', () => {
  const now = new Date('2026-11-30T15:00:00Z');
  const pct = (day, status = 'confirmed', policy = '30_15_v1') =>
    refundPercent({status,event_date:day}, 'stay', now, {stay_refund_policy_version:policy});
  assert.equal(pct('2026-12-31'),100);
  assert.equal(pct('2026-12-30'),50);
  assert.equal(pct('2026-12-16'),50);
  assert.equal(pct('2026-12-15'),0);
  assert.equal(pct('2026-12-01'),0);
  assert.equal(pct('2026-12-01','pending'),100);
  assert.throws(() => pct('2026-12-15','confirmed',null), {code:'MANUAL_REVIEW_REQUIRED'});
});

test('new refunds use the booked property schedule, not a later edit or common default', () => {
  const now = new Date('2026-11-30T15:00:00Z');
  const booked = [{days_before:20, refund_percent:100}, {days_before:5, refund_percent:70}, {days_before:0, refund_percent:25}];
  const other = [{days_before:5, refund_percent:40}, {days_before:0, refund_percent:0}];
  const tx = {status:'confirmed', event_date:'2026-12-10', businesses:{refund_policy:other}};
  assert.equal(refundPercent(tx,'stay',now,{stay_refund_policy_snapshot:booked}),70);
  assert.equal(refundPercent(tx,'stay',now,{stay_refund_policy_snapshot:other}),40);
  assert.throws(() => refundPercent(tx,'stay',now,{stay_refund_policy_snapshot:[]}),{code:'MANUAL_REVIEW_REQUIRED'});
  assert.throws(() => refundPercent(tx,'stay',now,{stay_refund_policy_snapshot:[{days_before:20,refund_percent:100}]}),{code:'MANUAL_REVIEW_REQUIRED'});
  assert.deepEqual(require('../stay-refund-policy').describe(other),['체크인 5일 전까지: 40% 환불','체크인 4일 전부터 당일까지: 환불 불가']);
});

test('receipt signing uses only paid intent IDs selected by the customer scope', async () => {
  const own = '00000000-0000-4000-8000-000000000123';
  const foreign = '00000000-0000-4000-8000-000000000456';
  const files = await receiptAttachments(new Map([[own,'S-transaction']]), async (path, options) => {
    const body = JSON.parse(options.body);
    if (path.includes('/rpc/')) {
      assert.deepEqual(body.target_intent_ids,[own]);
      return [{intent_id:own,object_path:own+'/card.pdf'}, {intent_id:own,object_path:own+'/cash.pdf'},
        {intent_id:foreign,object_path:foreign+'/cash.pdf'}, {intent_id:own,object_path:foreign+'/cash.pdf'}];
    }
    assert.deepEqual(body,{expiresIn:300,paths:[own+'/card.pdf',own+'/cash.pdf']});
    return body.paths.map(path=>({path,signedURL:'/object/sign/settlement-receipts/'+path+'?token=test'}));
  },'https://fixture.supabase.co');
  assert.deepEqual(files.map(({id,type})=>[id,type]),[['S-transaction','card'],['S-transaction','cash']]);
  assert.ok(files.every(file=>file.url.startsWith('https://fixture.supabase.co/storage/v1/object/sign/')));
});
