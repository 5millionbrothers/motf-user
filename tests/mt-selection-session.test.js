const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../mt-selection.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup({one=false,defer=false}={}) {
  let now=100000,finishWrite,writes=0,moves=0;const events={},dialogEvents={},documentEvents={},storage=new Map(),appended=[],error={textContent:''};
  const projects=[{id:'mt-a',title:'A의 MT',status:'planning'},{id:'mt-b',title:'B의 MT',status:'planning'}];if(one)projects.pop();
  const dialog={open:false,setAttribute(){},removeAttribute(){},addEventListener(name,handler){dialogEvents[name]=handler},showModal(){this.open=true},close(){this.open=false},querySelector(){return error}};
  const window={motfCurrentUserId:'a',motfMtWorkflow:require('../mt-workflow-model'),motfOrganizationReady:Promise.resolve(),
    motfRequireLogin:callback=>callback(),motfListWritableMtProjects:async()=>window.motfCurrentUserId==='a'?projects:[],
    motfReadMtSelection:async()=>({items:[],candidates:[]}),
    motfSetMtShoppingQuantity:async()=>{writes++;if(defer)await new Promise(resolve=>{finishWrite=resolve});return {id:'item',quantity:1,updated_at:'2026-11-13T00:00:00Z'}},
    motfMoveRecentMtSave:async()=>{moves++;return {save_reference:{kind:'shopping',recordIds:['item-b'],moveQuantity:1,expectedQuantity:1,updatedAt:null}}},
    addEventListener(name,handler){events[name]=handler}};
  const context={window,state:{},escapeHtml:String,refreshIcons(){},productVariants:value=>[value],normalizeProductQuantity:(_product,qty)=>qty || 1,
    Date:class extends Date{static now(){return now}},setTimeout:()=>1,clearTimeout(){},requestAnimationFrame(){},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    MutationObserver:class{observe(){}},document:{body:{append:element=>appended.push(element)},
      createElement:tag=>tag==='dialog'?dialog:{setAttribute(){},remove(){},contains:()=>false},querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(name,handler)=>{documentEvents[name]=handler}}};
  vm.runInNewContext(source,context);await tick();
  async function choose(projectId){const button={dataset:{selectionProject:projectId},hasAttribute:name=>name==='data-selection-project'};await dialogEvents.click({target:{closest:()=>button}});await tick();}
  async function add(id='water'){await window.motfOpenShoppingPicker({id,name:'생수'},1);await tick();}
  async function change(){const target={closest:selector=>selector==='[data-mt-receipt-change]'?{}:null};await documentEvents.click({target});await tick();}
  return {window,events,dialog,storage,appended,choose,add,change,error,setNow:value=>{now=value},finish:()=>finishWrite(),writes:()=>writes,moves:()=>moves};
}
test('first save asks for an MT even when there is only one',async()=>{
  const app=await setup({one:true});await app.add();assert.equal(app.writes(),0);assert.match(app.dialog.innerHTML,/data-selection-project="mt-a"/);
  await app.choose('mt-a');assert.equal(app.writes(),1);assert.match(app.appended.at(-1).innerHTML,/data-mt-receipt-change/);assert.equal(app.dialog.open,false);
});
test('subsequent saves reuse the choice without extending its three-hour expiry',async()=>{
  const app=await setup();await app.add();await app.choose('mt-a');const key='motf.recentSaveMt.v1.a',before=app.storage.get(key);
  app.setNow(200000);await app.add('snack');assert.equal(app.writes(),2);assert.equal(app.dialog.open,false);assert.equal(app.storage.get(key),before);
});
test('an expired choice asks again rather than falling back to the only MT',async()=>{
  const app=await setup({one:true});await app.add();await app.choose('mt-a');app.setNow(100000+3*60*60*1000);await app.add('snack');assert.equal(app.writes(),1);assert.equal(app.dialog.open,true);
});
test('browsing another MT never changes the remembered save destination',async()=>{
  const app=await setup();await app.add();await app.choose('mt-a');const key='motf.recentSaveMt.v1.a',before=app.storage.get(key);
  app.events['motf:mt-selected']({detail:{project:{id:'mt-b',status:'planning'}}});await app.add('snack');assert.equal(app.storage.get(key),before);assert.equal(app.writes(),2);
});
test('receipt Change always opens the chooser and only changes memory after the move succeeds',async()=>{
  const app=await setup();await app.add();await app.choose('mt-a');await app.change();assert.equal(app.dialog.open,true);assert.equal(app.moves(),0);
  await app.choose('mt-b');assert.equal(app.moves(),1);assert.equal(JSON.parse(app.storage.get('motf.recentSaveMt.v1.a')).projectId,'mt-b');
});
test('failed relocation preserves the remembered original destination',async()=>{
  const app=await setup();await app.add();await app.choose('mt-a');app.window.motfMoveRecentMtSave=async()=>{throw Error('공실 없음')};await app.change();await app.choose('mt-b');
  assert.equal(JSON.parse(app.storage.get('motf.recentSaveMt.v1.a')).projectId,'mt-a');assert.equal(app.error.textContent,'공실 없음');assert.equal(app.dialog.open,true);
});
test('an in-flight save never presents the previous account MT after account switch',async()=>{
  const app=await setup({defer:true});await app.add();const choosing=app.choose('mt-a');await tick();app.window.motfCurrentUserId='b';await app.events['motf:auth-ready']();app.finish();await choosing;
  assert.equal(app.dialog.open,false);assert.equal(app.appended.length,1);
});
test('a second destination click cannot start a second save during the first write',async()=>{
  const app=await setup({defer:true});await app.add();const choosing=app.choose('mt-a');await tick();await app.choose('mt-b');assert.equal(app.writes(),1);
  app.finish();await choosing;assert.equal(JSON.parse(app.storage.get('motf.recentSaveMt.v1.a')).projectId,'mt-a');
});
