const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../workflow-ui.js'),'utf8');
async function setup(names=['가평','대성리'],initial='가평') {
  let observer,events=0;
  const select={id:'stayRegion',value:initial,dataset:{},options:[{value:initial}],dispatchEvent(){events++;},
    set innerHTML(html){this.options=[...html.matchAll(/value="([^"]*)"/g)].map(match=>({value:match[1]}));}};
  const query={select(){return query},eq(){return query},order(){return query},then(resolve){return Promise.resolve({data:names.map(name=>({name})),error:null}).then(resolve)}};
  const window={motfSupabase:{from(){return query}},addEventListener(){}};
  const context={window,state:{reviewTargets:[]},escapeHtml:String,currentRoute:()=>'',console,Event:class{},requestAnimationFrame:callback=>callback(),
    matchMedia:()=>({matches:true,addEventListener(){}}),MutationObserver:class{constructor(callback){observer=callback}observe(){}},
    document:{body:{},addEventListener(){},querySelector:()=>null,querySelectorAll:selector=>selector.includes('#stayRegion')?[select]:[]}};
  vm.runInNewContext(source,context);
  await new Promise(resolve=>setImmediate(resolve));
  return {select,observer,eventCount:()=>events};
}
test('public region configuration remains separate from address labels',async()=>{
  const {select}=await setup();assert.deepEqual(select.options.map(item=>item.value),['가평','대성리']);
});
test('a later catalog refresh cannot replace configured region options',async()=>{
  const {select,observer}=await setup();select.options=[{value:'가평군'},{value:'가평 대성리'}];select.value='가평군';observer();
  assert.deepEqual(select.options.map(item=>item.value),['가평','대성리']);assert.equal(select.value,'가평');
});
test('deactivating the selected region refreshes the search value',async()=>{
  const result=await setup(['대성리','춘천']);assert.equal(result.select.value,'대성리');assert.equal(result.eventCount(),1);
});
