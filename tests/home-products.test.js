const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
const functions=source.slice(source.indexOf('function normalizedProductGroupToken'),source.indexOf('function productCatalogCountLabel'));
const product=(id,name,price=1000,extra={})=>({id,name,price,manufacturer:'QA',stockQuantity:null,...extra});
function home(products,ids){
 const store={products,...(ids===undefined?{}:{homeProductIds:ids})};
 const context=vm.createContext({stores:[store],ensureMarketBundleProducts(){}});
 vm.runInContext(functions,context);
 return JSON.parse(JSON.stringify(vm.runInContext('homeMarketProducts().map(row=>row.product)',context)));
}
test('homepage defaults to requested four products without changing catalog order',()=>{
 const products=[product('a','물'),product('b','목살'),product('c','테라'),product('d','삼겹살'),product('e','참이슬')];
 const before=products.map(p=>p.id);assert.deepEqual(home(products).map(p=>p.id),['d','b','e','c']);assert.deepEqual(products.map(p=>p.id),before);
});
test('saved homepage order is independent from the whole market catalog',()=>{
 const products=['물','삼겹살','목살','테라','참이슬'].map((name,n)=>product(String(n),name));
 assert.deepEqual(home(products,['3','0','4','1']).map(p=>p.id),['3','0','4','1']);
});
test('sold-out, zero-price, bundle, removed and duplicate variants cannot produce duplicate homepage cards',()=>{
 const products=[product('a','삼겹살',18000,{variantLabel:'수입 냉동'}),product('b','삼겹살',30000,{variantLabel:'냉장'}),product('c','품절',1000,{stockQuantity:0}),product('d','가격 없음',0),product('e','묶음',2000,{isBundle:true}),product('f','물'),product('g','참이슬'),product('h','테라')];
 assert.deepEqual(home(products,['a','b','c','removed']).map(p=>p.id),['a','f','g','h']);
});
