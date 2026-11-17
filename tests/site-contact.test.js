const {test,after} = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/site-contact');
const originalFetch = global.fetch;
const originalEnv = {...process.env};
const requestId = '10000000-0000-4000-8000-000000000001';
const body = {requestId,source:'partner',businessName:'테스트 업장',businessType:'숙소',contactName:'담당자',contact:'010-1234-5678',message:'입점 조건이 궁금합니다.',consent:true};
async function call(values=body,overrides={}) {
  let data;
  const res={setHeader(){},end(value){data=JSON.parse(value);}};
  await handler({method:'POST',headers:{host:'motf.co.kr',origin:'https://motf.co.kr','content-type':'application/json','x-vercel-forwarded-for':'203.0.113.1'},body:values,...overrides},res);
  return {status:res.statusCode,data};
}
after(()=>{global.fetch=originalFetch;process.env=originalEnv;});
test('site contact validates before database writes and rejects cross-origin requests',async()=>{
  global.fetch=()=>{throw new Error('must not reach database');};
  assert.equal((await call({...body,consent:false})).status,400);
  assert.equal((await call({...body,contact:''})).status,400);
  assert.equal((await call({...body,message:'x'})).status,400);
  assert.equal((await call({...body,website:'bot'})).status,400);
  assert.equal((await call(body,{headers:{host:'motf.co.kr',origin:'https://elsewhere.example','content-type':'application/json'}})).status,403);
  assert.equal((await call(body,{method:'GET'})).status,405);
  assert.equal((await call({...body,message:'x'.repeat(25000)})).status,413);
});
test('success requires a persisted case ID; caller cannot supply reporter or admin metadata',async()=>{
  process.env.SUPABASE_URL='https://db.example';process.env.SUPABASE_SERVICE_ROLE_KEY='private-test-key';
  let sent;
  global.fetch=async(url,options)=>{sent={url,body:JSON.parse(options.body)};return new Response(JSON.stringify(requestId),{status:200});};
  const result=await call({...body,reporter_id:'another-user',status:'resolved',admin_note:'injected'});
  assert.equal(result.status,201);assert.equal(result.data.id,requestId);
  assert.ok(sent.url.endsWith('/rpc/submit_site_contact'));
  assert.match(sent.body.request_ip_hash,/^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(sent.body).includes('203.0.113.1'));
  assert.equal(sent.body.reporter_id,undefined);assert.equal(sent.body.admin_note,undefined);
  global.fetch=async()=>new Response('null',{status:200});assert.equal((await call()).status,503);
});
test('anonymous feedback needs no contact and database failures never claim success',async()=>{
  const feedback={source:'feedback',topic:'오류 신고',message:'계산기 화면을 확인해주세요.',consent:true,requestId};
  global.fetch=async()=>new Response(JSON.stringify(requestId),{status:200});
  assert.equal((await call(feedback)).status,201);
  global.fetch=async()=>new Response(JSON.stringify({code:'P0429',message:'limited'}),{status:400});
  assert.equal((await call(feedback)).status,429);
  global.fetch=async()=>new Response(JSON.stringify({message:'private server detail'}),{status:500});
  const failed=await call(feedback);assert.equal(failed.status,503);assert.ok(!JSON.stringify(failed).includes('private server detail'));
});
