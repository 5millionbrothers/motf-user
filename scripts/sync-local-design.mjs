import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const source=path.resolve(process.argv[2]||path.resolve(root,'../../sites/motf-home-review/dist'));
const files=['study','round-two','round-three','refinement','home','pages','clarity','projects','community','layout','search-home'];
const styles=[];
for(const name of files)styles.push(`/* Accepted local design: ${name}.css */\n`+await fs.readFile(path.join(source,`${name}.css`),'utf8'));
await fs.writeFile(path.join(root,'local-design.css'),styles.join('\n').replaceAll("url('assets/", "url('assets/"));
const study=await fs.readFile(path.join(source,'study.js'),'utf8'),home=await fs.readFile(path.join(source,'home.js'),'utf8');
function extract(text,name){const start=text.indexOf(`function ${name}(`);if(start<0)throw new Error(name);const end=text.indexOf('\n}',start)+2;if(end<start)throw new Error(name);return text.slice(start,end);}
const selected=['costs','budgetParts','budgetLegend','expenseRows','extraExpenses','dates','projectMeta','candidateRows','meter','workspaceSection','organizationBand'].map(name=>extract(study,name));
selected.push('function purposeTabs(){return "";}');
for(const name of ['homeSectionTop','homeSearch','homePromoCard','homeEditorial','homeStays','homeMarket','homeCalculator','homeCommunity']){
  let code=extract(home,name);
  if(name==='homeSearch')code=code.replace(/const intro=`[\s\S]*?`;/,'const intro=`<div class="home-search-intro"><p>${escapeHtml(window.motfSiteCopy.supporting)}</p><h1>${escapeHtml(window.motfSiteCopy.headline)} <em>${escapeHtml(window.motfSiteCopy.headlineAccent)}</em></h1></div>`;');
  if(name==='homeStays')code=code.replaceAll('data-action="stays"','data-stay-id="${stay.id}"').replace('대성리 · 최대 ${[40,60,32][index]}명','${stay.region} · 최대 ${stay.maxPeople}명').replace("${index===0?'독채':index===1?'자연 속 쉼':'단체 공간'}",'${stay.badge}');
  if(name==='homeMarket')code=code.replace("pageProducts().filter(product=>['pork','neck','soda'].includes(product.id))",'pageProducts()').replace('src="assets/${product.image}"','src="${product.image}"').replace('대성 공판장 · ${product.unit}','${product.storeName} · ${product.unit}');
  if(name==='homePromoCard')code=code.replace('src="assets/${promo.image}"','src="${promo.image}"');
  if(name==='homeStays')code=code.replace('화장실 ${stay.bathrooms}개','${stay.bathLabel}');
  if(name==='homeStays'||name==='homeMarket')code=code.replaceAll(' 공간 예시','').replaceAll(' 예시"','"');
  if(name==='homeCommunity')code=code.replace('${homePosts.map','${homePosts.map');
  selected.push(code);
}
const prelude=`window.motfLocalTemplates=function(context){
const {state,stays,homePosts,homePromos,HomeStudy,pageProducts}=context;
const concept='home',exampleRates={lodging:30000,groceries:12000};
let budgetStep=context.budgetStep||100000,plannerPanel='budget',expensesExpanded=innerWidth>=700;
const money=value=>Math.round(value).toLocaleString('ko-KR');
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=name=>'<i data-lucide="'+name+'" aria-hidden="true"></i>';
const tools=[{action:'stays',icon:'house',title:'숙소 비교',subtitle:'우리 인원에 맞는 곳'},{action:'market',icon:'shopping-basket',title:'MT 장보기',subtitle:'고기부터 간식까지'},{action:'recreation',icon:'dices',title:'레크 고르기',subtitle:'분위기를 바꾸는 게임'},{action:'budget',icon:'receipt-text',title:'예결산 정리',subtitle:'쓴 돈도 깔끔하게'}];
function regionOptions(selected){return context.regions.map(region=>'<option '+(selected===region?'selected':'')+'>'+escapeHtml(region)+'</option>').join('');}
`;
await fs.writeFile(path.join(root,'local-home-templates.js'),prelude+selected.join('\n\n')+'\nreturn {homeSearch,homeEditorial,homeStays,homeMarket,homeCalculator,homeCommunity,organizationBand,workspaceSection,costs,budgetParts,budgetLegend,extraExpenses,expenseRows};\n};\n');
console.log('Synced accepted local CSS and home template functions; no mock router, sample catalog or localStorage app included.');
