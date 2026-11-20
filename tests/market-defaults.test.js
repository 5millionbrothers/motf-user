const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function catalog(products) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const context = vm.createContext({ state: { selectedStore: { products } } });
  vm.runInContext(source.slice(source.indexOf('function normalizedProductGroupToken'), source.indexOf('function productCatalogCountLabel')), context);
  return context;
}

for (const name of ['삼겹살', '목살']) {
  test(`${name}: defaults to cheapest frozen option, preserving group order`, () => {
    const products = [
      { id: 'cold', name, groupKey: name, price:31800, variantLabel:'국내산 냉장' },
      { id: 'water', name:'생수', price:1000 },
      { id: 'frozen-expensive', name, groupKey:name, price:24000, detailSections:{temperature:'냉동'} },
      { id: 'frozen', name, groupKey:name, price:18500, variantLabel:'수입 냉동' },
    ];
    const api = catalog(products);
    const grouped = api.groupProductVariants(products);
    assert.equal(grouped[0].id, 'frozen');
    assert.equal(grouped[1].id, 'water');
    assert.equal(products[0].id, 'cold');
    assert.equal(api.productVariants(products[0])[0].id, 'frozen-expensive');
    assert.equal(api.productVariants(grouped[0])[2].id, 'cold');
    assert.equal(api.productVariants(products[0]).length, 3);
  });
}

test('explicit default marker is respected without changing unrelated products', () => {
  const products = [
    {id:'first',name:'생수',groupKey:'water',price:1000},
    {id:'second',name:'생수',groupKey:'water',price:900},
    {id:'default',name:'삼겹살',groupKey:'pork',price:20000,detailSections:{isDefaultVariant:true}},
    {id:'other',name:'삼겹살',groupKey:'pork',price:18000,variantLabel:'냉동'},
  ];
  const grouped = catalog(products).groupProductVariants(products);
  assert.equal(grouped[0].id,'first');
  assert.equal(grouped[1].id,'default');
});

test('stay budget keeps filtering between two and four million', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const slider = {value:'2000000',max:'4000000'};
  const context = vm.createContext({
    state:{stayBudgetOverride:null},
    qs:s=>s==='#stayPrice'?slider:{value:s==='#stayRegion'?'전체':'10'},
    stays:[{id:'low',price:1800000,maxPeople:30},{id:'high',price:2800000,maxPeople:30},{id:'over',price:4500000,maxPeople:30}],
    normalizeStaySearchDates(){},ensureStayAvailability(){},getStayDetailFilters(){return {};},
    stayDisplayPrice:s=>s.price,stayMatchesDetailFilters:()=>true,stayHasAvailableRoom:()=>true,
  });
  vm.runInContext(source.slice(source.indexOf('function stayBudgetLimit()'),source.indexOf('function renderStays()')),context);
  assert.equal(context.getStayMatches().length,1);
  slider.value='3000000';assert.equal(context.getStayMatches().length,2);
  slider.value=slider.max;assert.equal(context.getStayMatches().length,3);
  context.state.stayBudgetOverride=4000000;assert.equal(context.getStayMatches().length,2);
  context.state.stayBudgetOverride=2799999;assert.equal(context.getStayMatches().length,1);
  context.state.stayBudgetOverride=0;assert.equal(context.getStayMatches().length,0);
});

test('the customer catalog uses the unhyphenated Coca-Cola brand and keeps escaping display names', () => {
  const source=fs.readFileSync(path.join(__dirname,'..','catalog.js'),'utf8');
  const context=vm.createContext({window:{motfEscapeHtml:value=>String(value).replaceAll('<','&lt;')}});
  const declarations=source.slice(source.indexOf('  const text = '),source.indexOf('  const imageUrl = '));
  vm.runInContext(declarations,context);
  assert.equal(vm.runInContext('marketText("코카-콜라")',context),'코카콜라');
  assert.equal(vm.runInContext('marketText("코카‑콜라<")',context),'코카콜라&lt;');
  const build=source.slice(source.indexOf('  function buildStore('),source.indexOf('  function buildStore(')+2300);
  assert.match(build,/manufacturer:\s*marketText\(item.detail_sections\?\.manufacturer\)/);
});
