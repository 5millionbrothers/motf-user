const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {readBody} = require('../api/_identity');
const person = {name:'인증 이용자',phone:'01012345678',birthDate:'2000-01-01'};
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
function flow(){
  const listeners=new Set(),root={setTimeout,clearTimeout,setInterval,clearInterval,addEventListener:(type,listener)=>listeners.add(listener),removeEventListener:(type,listener)=>listeners.delete(listener)};
  vm.runInNewContext(fs.readFileSync(require.resolve('../identity-flow.js'),'utf8'),{window:root});
  return {wait:options=>root.MotfIdentityFlow.waitForResult({origin:'https://motf.co.kr',timeoutMs:1000,pollMs:5,closeGraceMs:25,submit(){},...options}),message:data=>listeners.forEach(listener=>listener(data)),listeners};
}
test('parsed Vercel string and Buffer callbacks do not wait for a consumed stream',async()=>{
  const headers={'content-type':'application/x-www-form-urlencoded'};
  for(const body of ['res_cd=0000&reg_cert_key=test',Buffer.from('res_cd=0000&reg_cert_key=test')])assert.deepEqual(await readBody({headers,body}),{res_cd:'0000',reg_cert_key:'test'});
  assert.deepEqual(await readBody({headers:{'content-type':'application/json'},body:'{"purpose":"owner_signup"}'}),{purpose:'owner_signup'});
});
test('closed popup and lost postMessage still complete only from server-verified identity',async()=>{
  const f=flow(),popup={closed:false};let calls=0;
  const result=await f.wait({popup,submit(){popup.closed=true;},getStatus:async()=>++calls<3?{verified:false,status:'pending'}:{verified:true,person}});
  assert.equal(result.person.name,person.name);assert.equal(calls,3);assert.equal(f.listeners.size,0);
});
test('forged window messages never replace server verification',async()=>{
  const f=flow(),popup={closed:false};let done=false,verified=false;
  const waiting=f.wait({popup,getStatus:async()=>verified?{verified:true,person}:{verified:false}}).then(value=>{done=true;return value;});
  f.message({origin:'https://evil.example',source:popup,data:{type:'motf:kcp-identity',ok:true,person}});
  f.message({origin:'https://motf.co.kr',source:{},data:{type:'motf:kcp-identity',ok:true,person}});
  await delay(20);assert.equal(done,false);verified=true;await waiting;assert.equal(done,true);
});
test('transient network failure retries; unverified closed popup and expired token do not pass',async()=>{
  const f=flow();let calls=0;
  assert.equal((await f.wait({popup:{closed:false},getStatus:async()=>{if(++calls===1)throw Error('network');return {verified:true,person};}})).person.name,person.name);
  await assert.rejects(flow().wait({popup:{closed:true},getStatus:async()=>({verified:false})}),/닫혔습니다/);
  await assert.rejects(flow().wait({popup:{closed:false},getStatus:async()=>{throw Object.assign(Error('만료'),{status:401});}}),/만료/);
});
test('owner and customer use the same hardened popup waiter',()=>{
  assert.equal(fs.readFileSync(require.resolve('../identity-flow.js'),'utf8'),fs.readFileSync(__dirname+'/../../motf-owner-app/public/owner/identity-flow.js','utf8'));
  for(const file of ['../auth.js','../../motf-owner-app/public/owner/owner-identity.js'])assert.match(fs.readFileSync(__dirname+'/'+file,'utf8'),/MotfIdentityFlow\.waitForResult/);
});
