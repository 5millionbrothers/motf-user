const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const directory = path.resolve(__dirname,"../assets/market/daesung/disclosures");
const manifest = JSON.parse(fs.readFileSync(path.join(directory,"index.json"),"utf8"));
const catalogCode = fs.readFileSync(path.resolve(__dirname,"../catalog.js"),"utf8");
const appCode = fs.readFileSync(path.resolve(__dirname,"../app.js"),"utf8");
const grouping = appCode.slice(appCode.indexOf("function normalizedProductGroupToken("),appCode.indexOf("function homeMarketProducts("));
const marketId = "d5513697-7341-4cc6-a16b-781caf6b902d";
const representative = "12a6f053-01c2-57b1-8806-cd8807c3b739";
const shinBag = "37db6541-2368-52a1-b438-e26aea211968";
const shinCup = "678a2375-03aa-5e83-8329-4ee53c488bbe";
const postick = "3574f59d-ff14-545e-9faf-cd1c813a501b";
const rolling = "a9ab6a62-10fe-5d05-b420-6daee67ee4a4";

test("every disclosure and replacement cover points to a packaged label", () => {
  const images = new Set();
  for (const record of Object.values(manifest)) {
    assert.ok(record.sourceName && record.sourceUnit);
    for (const filename of record.photos || []) {
      assert.match(filename,/^label-\d{3}\.webp$/);
      assert.equal(fs.readFileSync(path.join(directory,filename)).toString("ascii",8,12),"WEBP");
      images.add(filename);
    }
    if (record.coverPhoto) assert.ok(record.photos.includes(record.coverPhoto));
  }
  assert.deepEqual([...images].sort(),fs.readdirSync(directory).filter(file=>file.endsWith(".webp")).sort());
});

async function loadMarket(offers, {id=marketId,missing=false} = {}) {
  const query = data => ({select(){return this;},eq(){return this;},order(){return this;},then(resolve){resolve({data});}});
  const business = {id,business_name:"대성 공판장",business_type:"market"};
  const offerings = offers.map(o=>({...o,business_id:id}));
  const { products } = await new Promise(resolve => {
    const window = {
      innerWidth:390,
      motfApplyCatalog: (_, [store])=>resolve(store),
      motfSupabase:{from:table=>query(table==="businesses"?[business]:offerings),rpc:async()=>({data:[]})},
    };
    vm.runInNewContext(catalogCode,{window,URL,console,fetch:async()=>({ok:!missing,json:async()=>manifest})});
  });
  return Array.from(products);
}

function offer(id,category,name,extra={}) {
  const data=manifest[id];
  return {id,category,name:data?.sourceName||name,unit:data?.sourceUnit||"1개",price:1750,
    detail_sections:{productDisplayName:name,productGroupKey:name,variantLabel:data?.sourceUnit},...extra};
}

test("individual Shin items never group while Cass keeps the Fresh 464mL representative", async () => {
  const cass=Object.entries(manifest).filter(([,row])=>row.groupKey==="cass").map(([id,row])=>offer(id,"주류",row.sourceName.split(" · ")[0]));
  const products=await loadMarket([...cass,offer(shinBag,"라면","신라면"),offer(shinCup,"라면","신라면"),
    offer(postick,"과자·안주","포스틱"),offer(rolling,"주류","카스 프레시")]);
  assert.ok(!products.some(p=>p.id===postick||p.id===rolling));
  const grouped=vm.runInNewContext(grouping+"groupProductVariants(products)",{products});
  const group=grouped.find(p=>p.name==="카스");
  assert.equal(group.id,representative);
  assert.equal(group.variants.length,8);
  assert.equal(group.variants.find(x=>x.name==="카스 레몬 스퀴즈").detailSections.alcohol,"4.5%");
  assert.notEqual(products.find(p=>p.id===shinBag).groupKey,products.find(p=>p.id===shinCup).groupKey);
  assert.ok(products.find(p=>p.id===shinBag).disclosure.fields.includes("nutrition"));
  assert.equal(products.find(p=>p.id===shinBag).price,1750);
});

test("only the matched offering receives the disclosure override", async () => {
  const a=offer(shinBag,"라면","신라면");
  for (const [row,opts] of [[{...a,unit:"1개"},{}],[a,{missing:true}],[a,{id:"other-market"}]]) {
    const [product]=await loadMarket([row],opts);
    assert.equal(product.disclosure,null);
    assert.equal(product.name,"신라면");
  }
});

test("reference images do not replace verified disclosure fields", async () => {
  const tray = "b5de9271-c862-5103-9e13-21249986d305";
  const jinro = "dc36d8f0-500e-5ad7-9879-bc3e27c1366a";
  const [plate,soju] = await loadMarket([offer(tray,"일회용품","위생접시 DY-180"),offer(jinro,"주류","진로 이즈백")]);
  assert.equal(plate.disclosure.reference,true);
  assert.equal(plate.disclosure.fields.length,0);
  assert.match(plate.disclosure.note,/DY-150/);
  assert.notEqual(plate.disclosure.photos.length,0);
  assert.equal(soju.disclosure.reference,false);
  assert.equal(soju.detailSections.alcohol,"16.0%");
  assert.ok(soju.disclosure.fields.includes("nutrition"));
});
