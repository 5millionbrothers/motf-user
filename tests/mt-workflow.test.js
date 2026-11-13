const test=require('node:test'),assert=require('node:assert/strict');
const model=require('../mt-workflow-model');
const projects=[{id:'a',status:'planning'},{id:'b',status:'planning'},{id:'old',status:'completed'},{id:'invited',status:'planning',is_owner:false}];
test('recent destination requires an explicit, unexpired choice',()=>{
  assert.equal(model.recentProject([projects[0]],null,100),null);
  assert.equal(model.recentProject(projects,{projectId:'b',selectedAt:100},101).id,'b');
  assert.equal(model.recentProject(projects,{projectId:'b',selectedAt:100},100+model.recentTtlMs),null);
});
test('recent destination excludes completed, read-only, deleted and future-dated choices',()=>{
  for(const projectId of ['old','invited','deleted'])assert.equal(model.recentProject(projects,{projectId,selectedAt:100},101),null);
  assert.equal(model.recentProject(projects,{projectId:'a',selectedAt:102},101),null);
  assert.equal(model.recentProject(projects,'a',101),null);
});
test('one writable ongoing MT is selected without another choice',()=>assert.equal(model.activeProject([projects[0],projects[2],projects[3]],'')?.id,'a'));
test('the preferred MT wins when several are ongoing',()=>assert.equal(model.activeProject(projects,'b')?.id,'b'));
test('several MTs without a current choice still require selection',()=>assert.equal(model.activeProject(projects,''),null));
test('completed or read-only MTs are never automatic targets',()=>assert.equal(model.activeProject([projects[2],projects[3]],'old'),null));
test('a removed preference falls back only when there is one ongoing MT',()=>assert.equal(model.activeProject([projects[1]],'deleted')?.id,'b'));
for(const [value,min,step,expected] of [[0,1,1,0],[-1,1,1,0],[3,2,2,4],[1,6,3,6],[1001,1,1,1000],[1000,6,3,999],['bad',2,2,2]])test(`quantity ${value} obeys minimum ${min} and step ${step}`,()=>assert.equal(model.quantity(value,min,step),expected));
test('saved room counts distinguish businesses and rooms',()=>{
  const snapshot={candidates:[{business_id:'a',offering_id:'r1'},{business_id:'a',offering_id:'r2'},{business_id:'b',offering_id:'r3'}]};
  assert.equal(model.roomCount(snapshot,'a'),2);assert.equal(model.roomCount(snapshot,'a','r1'),1);assert.equal(model.roomCount(snapshot,'a','r9'),0);
});
test('shopping lookup ignores deleted or other-kind items',()=>{
  const snapshot={items:[{reference_id:'x',item_kind:'stay',quantity:5},{reference_id:'x',item_kind:'shopping',status:'cancelled',quantity:2},{reference_id:'x',item_kind:'shopping',status:'planned',quantity:3}]};
  assert.equal(model.shoppingItem(snapshot,'x').quantity,3);assert.equal(model.shoppingItem(snapshot,'y'),undefined);
});
