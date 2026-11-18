const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../budget-model');
const {source,officialReceipt}=require('../api/budget-sources');
const paid={id:'purchase',kind:'market',name:'공판장',paid:true,paidAt:'2026-11-18',cashPaid:80000,points:20000,coupon:0,gross:100000,status:'confirmed',refundStatus:'none',evidenceId:'M-purchase',items:[{name:'고기',quantity:4,price:24000},{name:'음료',quantity:1,price:4000}]};
const project={title:'우리 MT',items:[{id:'p',item_kind:'shopping',title:'고기',quantity:5,amount:18500,status:'planned'},{id:'b',item_kind:'other',title:'버스',quantity:1,amount:200000,status:'planned'}]};
test('MT budget ignores even a supplied payment, has no actual/receipt columns or evidence sheets',()=>{
  const r=M.exportReport({project},[paid],{evidence:true});
  assert.equal(r.totals.budgetExpense,292500);assert.equal(r.sources.length,0);assert.equal(r.ledger.length,0);
  const specs=M.specs(r);assert.deepEqual(specs.map(s=>s.name),['예산안']);
  assert.equal(specs[0].rows[5].includes('실제 결제액'),false);
  assert.equal(M.exportReport({project},[],{other:false}).totals.budgetExpense,92500);
});
test('settlement rejects unpaid plans and counts a multi-item payment once',()=>{
  const r=M.exportReport({},[paid,{...paid,id:'unpaid',paid:false}],{evidence:true});
  assert.equal(r.sources.length,1);assert.equal(r.totals.cashOut,80000);
  const spec=M.specs(r);assert.deepEqual(spec.map(s=>s.name),['결산','증빙 목록']);
  assert.equal(spec[0].rows.filter(row=>row[6]===80000).length,1);
  assert.equal(spec[0].rows[6][8].result,80000);
});
test('refund awaiting confirmation does not fabricate a zero refund or a net spend',()=>{
  const r=M.exportReport({},[{...paid,refundStatus:'processing',cashRefund:null}]);
  const spec=M.specs(r)[0];assert.equal(spec.rows[6][7],null);assert.equal(spec.rows[6][8].result,'');
  const totals=spec.rows.find(row=>row[0]==='합계');assert.equal(totals[8].result,'');
});
test('NICE card receipts use server-bound original TID; unpaid and mock payments are not evidence',()=>{
  const tid='nice00000m01012611180000000001';
  assert.equal(tid.length,30);
  const intent={provider:'nicepay',payment_method:'CARD',payment_key:tid,status:'confirmed',paid_at:'2026-11-18',amount:10000,payment_response:{TID:tid}};
  assert.match(officialReceipt(intent),/npg\.nicepay\.co\.kr/);
  assert.equal(officialReceipt({...intent,payment_response:{TID:'wrong'}}),null);
  assert.equal(officialReceipt({...intent,payment_method:'VBANK'}),null);
  assert.equal(source({}, {...intent,status:'virtual_account_issued'},'stay').receiptUrl,null);
  assert.equal(source({}, {...intent,provider:'mock'},'stay').paid,false);
});
