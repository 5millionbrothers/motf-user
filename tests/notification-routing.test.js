const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { notificationRecipient } = require('../api/_notification-recipient');

test('recipient validation checks template role and mobile without any fallback', () => {
  for (const [role, prefix, phone] of [['owner','OWNER','01024681357'],['user','USER','01035792468'],['admin','ADMIN','01046813579']]) {
    assert.equal(notificationRecipient({recipient_role:role,template_key:prefix+'_CHAT_RECEIVED_V1',recipient_phone:phone}),phone);
  }
  for (const phone of [null,'','0507-1330-4415','02-123-4567','01000000000','01012121212','0101234567']) {
    assert.throws(() => notificationRecipient({recipient_role:'owner',template_key:'OWNER_CHAT_RECEIVED_V1',recipient_phone:phone}), /수신 휴대폰/);
  }
  assert.throws(() => notificationRecipient({recipient_role:'user',template_key:'OWNER_CHAT_RECEIVED_V1',recipient_phone:'01024681357'}), /역할/);
});

async function dispatch({routeError=false,wrongRole=false,sendTimeout=false,completionError=false,fullBatch=false,claimTimeout=false}={}) {
  const calls=[], completions=[];
  const items=[
    {id:'owner-event',template_key:'OWNER_CHAT_RECEIVED_V1',recipient_role:'owner',recipient_user_id:'owner-id',recipient_phone:'01024681357'},
    {id:'user-event',template_key:'USER_CHAT_RECEIVED_V1',recipient_role:'user',recipient_user_id:'user-id',recipient_phone:'01035792468'},
    {id:'admin-event',template_key:'ADMIN_NEW_ORDER_V1',recipient_role:'admin',recipient_user_id:'admin-id',recipient_phone:'01046813579'},
  ];
  if(fullBatch)items.push({...items[0],id:'owner-event-2'});
  const codes=['UJ_4566','UJ_4563','UJ_4578'];
  const fakeFetch=async (url, options) => {
    const body=JSON.parse(options.body || '{}'); calls.push({url,body});
    let data; let ok=true;
    if (url.endsWith('/claim_notification_batch')) {if(claimTimeout)throw Error('claim response lost');data=items;}
    else if (url.endsWith('/notification_delivery_route')) {
      if(routeError) {ok=false;data={message:'수신번호 미확인'};}
      else {const item=items.find(row=>row.id===body.target_outbox_id); data={...item,routing_source:'outbox',...(wrongRole?{recipient_role:'admin'}:{})};}
    } else if(url.endsWith('/complete_notification')) {completions.push(body);data=completionError?{message:'DB completion unavailable'}:null;ok=!completionError;}
    else if(url.endsWith('/mark_notification_delivery_unknown')) {completions.push({...body,review:true});data=null;}
    else if(url.endsWith('/request_notification_dispatch_followup'))data=null;
    else if(body.path==='/akv10/template/list/') data={code:0,list:codes.map(templtCode=>({templtCode,inspStatus:'APR',status:'A',templtContent:'검증 메시지'}))};
    else if(body.path==='/akv10/alimtalk/send/') {if(sendTimeout)throw Error('provider response lost');data={code:0,info:{mid:'mock-provider-id'}};}
    else throw Error('Unexpected network call: '+url);
    return {ok,status:ok?200:400,json:async()=>data};
  };
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../api/notifications-dispatch'),'utf8'), {
    require:(name)=>name.startsWith('.')?require('../api/'+name):require(name),module,fetch:fakeFetch,
    process:{env:{SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server',NOTIFICATION_DISPATCH_SECRET:'dispatch',
      ALIGO_LIVE_ENABLED:'true',ALIGO_RELAY_URL:'https://example-relay.test',ALIGO_RELAY_SECRET:'relay',ALIGO_TEST_PHONE:'01033572537'}},
    URL,URLSearchParams,AbortController,Buffer,setTimeout,clearTimeout,console,Date,
  });
  let response;
  const res={setHeader(){},end(value){response=JSON.parse(value);}};
  await module.exports({method:'POST',url:'/api/notifications-dispatch',headers:{'x-notification-secret':'dispatch'},body:{source:'notification_outbox_trigger'}},res);
  return {calls,completions,response};
}

test('stale global test phone never overrides three distinct recipients in live dispatch', async () => {
  const {calls,completions}=await dispatch();
  assert.deepEqual(calls.filter(row=>row.body.path==='/akv10/alimtalk/send/').map(row=>row.body.params.receiver_1),['01024681357','01035792468','01046813579']);
  assert.equal(completions.length,3);
  assert.ok(completions.every(row=>row.final_status==='sent' && row.target_request_payload.testRecipientOverride===false));
});
test('unconfirmed DB route prevents provider calls, without a fallback number', async () => {
  const {calls,completions}=await dispatch({routeError:true});
  assert.equal(calls.filter(row=>row.url.includes('relay')).length,0);
  assert.ok(completions.every(row=>row.final_status==='failed' && row.target_error_message==='수신번호 미확인'));
});
test('route with a different user or role cannot be sent', async () => {
  const {calls}=await dispatch({wrongRole:true});
  assert.equal(calls.filter(row=>row.body.path==='/akv10/alimtalk/send/').length,1);
});
test('send timeout never falls back to a second provider request or automatic failed retry',async()=>{
  const {calls,completions}=await dispatch({sendTimeout:true});
  assert.equal(calls.filter(row=>row.body.path==='/akv10/alimtalk/send/').length,3);
  assert.equal(completions.length,3);assert.ok(completions.every(row=>row.review));
});
test('successful provider acceptance followed by DB failure never requeues a second send',async()=>{
  const {calls,completions,response}=await dispatch({completionError:true});
  assert.equal(calls.filter(row=>row.body.path==='/akv10/alimtalk/send/').length,3);
  assert.ok(completions.every(row=>row.final_status==='sent'));
  assert.ok(response.results.every(row=>row.status==='processing'));
});
test('bounded four-job dispatch shares one template lookup and schedules an immediate next batch',async()=>{
  const {calls,response}=await dispatch({fullBatch:true});
  assert.equal(calls.find(row=>row.url.endsWith('/claim_notification_batch')).body.batch_limit,4);
  assert.equal(calls.filter(row=>row.body.path==='/akv10/template/list/').length,1);
  assert.equal(calls.filter(row=>row.url.endsWith('/request_notification_dispatch_followup')).length,1);
  assert.equal(response.results.length,4);
});
test('lost claim response is not retried against a second transport, so another batch is not orphaned',async()=>{
  const {calls,response}=await dispatch({claimTimeout:true});
  assert.equal(calls.length,1);assert.equal(response.ok,false);
});
