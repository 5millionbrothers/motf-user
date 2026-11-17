const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function load(file,mocks){const module={exports:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../api/'+file),'utf8'),{require:name=>mocks[name]||require(name.startsWith('.')?'../api/'+name:name),module,URL,Buffer,console,Date});return module.exports;}
const realIdentity=require('../api/_identity');
async function call(handler,body){let result;const res={setHeader(){},end:value=>{result=JSON.parse(value);}};await handler({method:'POST',headers:{origin:'https://www.motfowner.co.kr','content-type':'application/json'},body},res);return {status:res.statusCode,...result};}
test('account site uses explicit validated type with owner-origin compatibility',()=>{
 const accounts=require('../api/_accounts');
 assert.equal(accounts.accountTypeForRequest({headers:{origin:'https://www.motfowner.co.kr'}}),'partner');
 assert.equal(accounts.accountTypeForRequest({headers:{origin:'https://motf.co.kr'}}),'user');
 assert.equal(accounts.accountTypeForRequest({headers:{}},{accountType:'user'}),'user');
 assert.throws(()=>accounts.accountTypeForRequest({headers:{}},{accountType:'admin'}),/계정 종류/);
});
test('login resolution and identity duplicate checks are scoped to account site',async()=>{
 const paths=[];const accounts=load('_accounts.js',{'./_server':{supabaseRequest:async(path,options)=>{paths.push({path,body:options?.body&&JSON.parse(options.body)});if(path.includes('&select=identity_ci_hash'))return [{identity_ci_hash:'ci',account_type:'partner',status:'approved'}];return [];}}});
 await accounts.accountForLogin('owner1','partner');
 assert.equal(paths[0].body.target_account_type,'partner');assert.match(paths[0].path,/resolve_account_login_for_site/);
 await accounts.assertIdentityMatchesProfile({user_id:'u1',verified_ci_hash:'ci'},'u1');
 assert.ok(paths.some(item=>item.path.includes('account_type=eq.partner')));
});
test('owner signup ignores a customer identity but still blocks duplicate owner signup',async()=>{
 for(const duplicate of [false,true]){
  const paths=[];
  const handler=load('identity-signup.js',{'./_server':{...require('../api/_server'),requireEnv(){},supabaseRequest:async(path,options)=>{paths.push(path);if(path.includes('identity_ci_hash')){assert.match(path,/account_type=eq.partner/);return duplicate?[{id:'existing-owner'}]:[];}return path==='/auth/v1/admin/users'?{id:'new-owner'}:[];}},'./_identity':{...realIdentity,verifiedSession:async()=>({id:'identity',verified_ci_hash:'same-customer-ci',verified_name:'검증',verified_phone:'01012345678',verified_birth_date:'2000-01-01'})},'./_accounts':{normalizeUsername:v=>v,validUsername:()=>true,limitAccountRequest:async()=>{},claimIdentitySession:async()=>{}}});
  const result=await call(handler,{accountType:'partner',username:'owner1',password:'Abcd123!',termsAccepted:true,businessType:'stay',businessName:'검증 숙소'});
  assert.equal(result.status,duplicate?409:200);assert.equal(paths.includes('/auth/v1/admin/users'),!duplicate);
 }
});
test('password reset cannot consume an identity session from the other site',async()=>{
 let resolved=false;
 const handler=load('identity-password-reset.js',{'./_server':{requireEnv(){}},'./_identity':{...realIdentity,verifiedSession:async()=>({request_context:{account_type:'user'}})},'./_accounts':{accountTypeForRequest:()=> 'partner',accountForLogin:async()=>{resolved=true;},limitAccountRequest:async()=>{},claimIdentitySession:async()=>{throw Error('must not claim');}}});
 const result=await call(handler,{accountType:'partner',identifier:'owner1',password:'Abcd123!',identityToken:'customer-token'});
 assert.equal(result.status,403);assert.equal(resolved,false);assert.match(result.message,/사이트에서 다시/);
});
