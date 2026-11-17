const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const realIdentity=require('../api/_identity');
const valid={id:'session-1',status:'pending',expires_at:'2099-01-01T00:00:00Z',request_context:{return_url:'https://www.motfowner.co.kr/'},provider_response:{order_id:'order-1'}};
const person={name:'인증 이용자',phone:'01012345678',birthDate:'2000-01-01'};
function load(file,mocks){const module={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../api/'+file),'utf8'),{require:name=>mocks[name]||require(name.startsWith('.')?'../api/'+name:name),module,URL,Buffer,console,Date,setTimeout});return module.exports;}
async function call(handler,body,method='POST'){
 let result;const headers={};const res={setHeader:(k,v)=>headers[k]=v,end:value=>{result=value;}};
 await handler({method,headers:{origin:'https://www.motfowner.co.kr','content-type':typeof body==='string'?'application/x-www-form-urlencoded':'application/json'},body,...(method==='GET'?{query:body}:{})},res);
 return {status:res.statusCode,body:result,headers};
}
test('KCP callback accepts Vercel encoded body, saves verified result before notifying owner',async()=>{
 const writes=[];let queried=0;
 const handler=load('identity-callback.js',{'./_server':{supabaseRequest:async(path,options)=>{if(!options)return [valid];writes.push(JSON.parse(options.body));return [{status:'verified'}];}},'./_identity':{...realIdentity,kcpResult:async()=>{queried++;return {user_name:person.name,phone_no:person.phone,birth_day:'20000101',CI_URL:'CI%2Funit',DI_URL:'DI%2Funit'};},identityHash:value=>'hash:'+value}});
 const result=await call(handler,'res_cd=0000&reg_cert_key=test&ordr_idxx=order-1');
 assert.equal(result.status,200);assert.equal(queried,1);assert.equal(writes[0].verified_name,person.name);assert.equal(writes[0].verified_ci_hash,'hash:CI/unit');assert.match(result.body,/'?ok"?:true/);assert.match(result.body,/www.motfowner.co.kr/);assert.ok(!result.body.includes(person.phone));assert.equal(result.headers['Cache-Control'],'no-store');
});
test('callback GET and repeated verified callbacks do not consume a KCP key twice',async()=>{
 const handler=load('identity-callback.js',{'./_server':{supabaseRequest:async()=>[{...valid,status:'verified'}]},'./_identity':{...realIdentity,kcpResult:async()=>{throw Error('must not query again');}}});
 assert.equal((await call(handler,{res_cd:'0000',reg_cert_key:'test'},'GET')).status,200);
 assert.equal((await call(handler,{res_cd:'0000',reg_cert_key:'test',ordr_idxx:'different'})).status,400);
});
test('cancelled, expired and unsaved KCP results never become signup success',async()=>{
 for(const [session,body,saved] of [[valid,{res_cd:'9999',reg_cert_key:'test'},true],[{...valid,expires_at:'2000-01-01'}, {res_cd:'0000',reg_cert_key:'test'},true],[valid,{res_cd:'0000',reg_cert_key:'test'},false]]){
  const handler=load('identity-callback.js',{'./_server':{supabaseRequest:async(path,options)=>options?(saved?[{status:'verified'}]:[]):[session]},'./_identity':{...realIdentity,identityHash:()=>'',kcpResult:async()=>({...person,ci:'CI'})}});
  const result=await call(handler,body);assert.equal(result.status,400);assert.match(result.body,/"ok":false/);
 }
});
test('status pending contains no personal data, while expired/mismatched sessions fail closed',async()=>{
 let row=valid;
 const handler=load('identity-status.js',{'./_server':{supabaseRequest:async()=>row?[row]:[]}});
 let result=await call(handler,{identityToken:'opaque-token',purpose:'owner_signup'});assert.equal(result.status,200);assert.equal(JSON.parse(result.body).verified,false);assert.equal(JSON.parse(result.body).person,undefined);
 row={...valid,status:'verified',verified_name:person.name,verified_phone:person.phone,verified_birth_date:person.birthDate};result=await call(handler,{identityToken:'opaque-token',purpose:'signup'});assert.equal(JSON.parse(result.body).person.name,person.name);
 row=null;assert.equal((await call(handler,{identityToken:'opaque-token',purpose:'signup'})).status,401);
 assert.equal((await call(handler,{identityToken:'',purpose:'signup'})).status,400);
});
for(const accountType of ['user','partner'])test(accountType+' signup creates one account with verified identity and no contact-email verification roundtrip',async()=>{
 const paths=[];
 const identity={id:'identity-1',verified_ci_hash:'hash-ci',verified_name:person.name,verified_phone:person.phone,verified_birth_date:person.birthDate,verified_at:'2026-11-17T00:00:00Z'};
 const handler=load('identity-signup.js',{'./_server':{...require('../api/_server'),requireEnv(){},supabaseRequest:async(path,options)=>{paths.push({path,body:options?.body&&JSON.parse(options.body)});return path==='/auth/v1/admin/users'?{id:'new-account'}:[];}},'./_identity':{...realIdentity,verifiedSession:async(token,purpose)=>{assert.equal(token,'verified-token');assert.equal(purpose,accountType==='partner'?'owner_signup':'signup');return identity;}},'./_accounts':{normalizeUsername:v=>v,validUsername:()=>true,limitAccountRequest:async()=>{},claimIdentitySession:async()=>{}}});
 const result=await call(handler,{accountType,identityToken:'verified-token',username:'newowner',password:'Abcd123!',email:'contact@example.com',termsAccepted:true,businessType:'stay',businessName:'검증 숙소',name:'forged'});
 assert.equal(result.status,200);assert.equal(JSON.parse(result.body).emailConfirmationRequired,false);assert.equal(paths.filter(x=>x.path==='/auth/v1/admin/users').length,1);const profile=paths.find(x=>x.path.endsWith('complete_identity_signup_profile')).body;assert.equal(profile.target_full_name,person.name);assert.equal(profile.target_phone,person.phone);assert.equal(paths[0].path.includes('identity_ci_hash'),true);
});
