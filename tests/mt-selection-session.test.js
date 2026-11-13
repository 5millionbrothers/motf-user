const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../mt-selection.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function scenario(switchUser) {
  let finishWrite,writing=false;const events={},appended=[];
  const project={id:'mt-a',title:'A의 MT',status:'planning'},product={id:'water',name:'생수'};
  const dialog={open:false,setAttribute(){},addEventListener(){},showModal(){this.open=true},close(){this.open=false},querySelector(){return {textContent:''}}};
  const window={motfCurrentUserId:'a',motfMtWorkflow:require('../mt-workflow-model'),motfOrganizationReady:Promise.resolve(),
    motfRequireLogin:callback=>callback(),motfListWritableMtProjects:async()=>window.motfCurrentUserId==='a'?[project]:[],
    motfReadMtSelection:async()=>({items:[],candidates:[]}),
    motfSetMtShoppingQuantity:async()=>{writing=true;await new Promise(resolve=>{finishWrite=resolve})},
    addEventListener(name,handler){events[name]=handler}};
  vm.runInNewContext(source,{window,state:{},escapeHtml:String,refreshIcons(){},productVariants:value=>[value],
    setTimeout:()=>1,clearTimeout(){},requestAnimationFrame(){},localStorage:{getItem:()=>'',setItem(){}},
    MutationObserver:class{observe(){}},document:{body:{append:element=>appended.push(element)},
      createElement:tag=>tag==='dialog'?dialog:{setAttribute(){},remove(){}},querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}}});
  await tick();await window.motfOpenShoppingPicker(product,1);await tick();assert.equal(writing,true);
  if(switchUser){window.motfCurrentUserId='b';await events['motf:auth-ready']();}
  finishWrite();await tick();return {dialog,appended};
}
test('successful save closes the picker and presents the MT shortcut',async()=>{
  const {dialog,appended}=await scenario(false);assert.equal(dialog.open,false);assert.equal(appended.length,2);assert.match(appended[1].innerHTML,/내 MT 보기/);
});
test('an in-flight save never presents the previous account MT after account switch',async()=>{
  const {dialog,appended}=await scenario(true);assert.equal(dialog.open,false);assert.equal(appended.length,1);
});
