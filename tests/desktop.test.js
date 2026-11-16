const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const M = require('../desktop-model');
test('desktop budget leaves a reserve and includes travel and recreation', () => {
  for (const people of [2,32,200]) for (const budget of [0,10000,1000000,3000000,10000000]) {
    const result = M.budget({people,budget});
    assert.equal(result.used + result.remaining,budget);
    if(budget >= 1000000) {assert.ok(result.remaining > 0);assert.ok(result.travel > 0);assert.ok(result.play > 0);}
  }
  assert.notEqual(M.budget({people:32,budget:1000000}).tier,M.budget({people:32,budget:5000000}).tier);
  assert.ok(M.budget({people:32,budget:5000000}).used > M.budget({people:32,budget:3000000}).used);
  assert.equal(M.budget({people:32,budget:1000,extraCosts:[{amount:5000}]}).remaining,-4000);
});
test('desktop author policy restricts edits but retains deletion',()=>{
  assert.deepEqual(M.authorPolicy({owned:true,replyCount:1}),{edit:false,remove:true});
  assert.deepEqual(M.authorPolicy({owned:false}),{edit:false,remove:false});
  assert.deepEqual(M.authorPolicy({owned:true,deleted:true}),{edit:false,remove:false});
});
test('desktop scripts do not initialize on mobile',()=>{
  for(const file of ['desktop-ui.js','desktop-replies.js'])vm.runInNewContext(fs.readFileSync(require.resolve('../'+file),'utf8'),{matchMedia:()=>({matches:false})});
});
test('mobile calculator retains the exact pre-change budget allocation',()=>{
  const context={state:{people:32,budget:3000000,extraCosts:[],marketItems:[]},stays:[],homePosts:[],homePromos:[],HomeStudy:{},pageProducts:()=>[]};
  const sandbox={window:{MotfDesktopModel:M},innerWidth:390};vm.runInNewContext(fs.readFileSync(require.resolve('../local-home-templates.js'),'utf8'),sandbox);
  const cost=sandbox.window.motfLocalTemplates(context).costs();
  assert.equal(cost.used,3000000);assert.equal(cost.remaining,0);assert.equal(cost.travel,undefined);
  sandbox.innerWidth=1440;const desktop=sandbox.window.motfLocalTemplates(context).costs();assert.ok(desktop.remaining>0);assert.ok(desktop.travel>0);
});
test('desktop product summary removes container duplication and option counts',()=>{
  assert.equal(M.productSummary({},[{unit:'캔 / 500mL'},{unit:'캔 / 500mL×6입'}]),'500mL / 500mL×6입');
  assert.equal(M.productSummary({},[{unit:'병 / 360mL'},{unit:'병 / 360mL'},{unit:'360mL×6병'}]),'360mL / 360mL×6병');
  assert.equal(M.productSummary({unit:'750mL',manufacturer:'우리술'}),'750mL · 우리술');
  assert.equal(M.productSummary({unit:'1kg',manufacturer:'너무 긴 제조사 이름으로 용량 표시를 방해하지 않아요'}),'1kg');
  assert.equal(M.productSummary({unit:'1세트'}),'1세트');
  assert.equal(M.productSummary({unit:''}),'');
});
