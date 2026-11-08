import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const copy=JSON.parse(await fs.readFile(path.join(root,'site-copy.json'),'utf8'));
const source=await fs.readFile(path.join(root,'index.html'),'utf8');
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=value=>JSON.stringify(value).replaceAll('<','\\u003c');
function shell(route){const page=copy.routes[route]||copy.routes['/'],url=copy.origin+route,description=page.description||copy.description;
 const metadata=`<!-- motf:metadata:start -->\n    <title>${escape(page.title)}</title>\n    <meta name="description" content="${escape(description)}" />\n    <meta name="robots" content="${page.private?'noindex, follow':'index, follow'}" />\n    <link rel="canonical" href="${url}" />\n    <meta property="og:type" content="website" />\n    <meta property="og:locale" content="ko_KR" />\n    <meta property="og:site_name" content="모티프(moTF)" />\n    <meta property="og:title" content="${escape(page.title)}" />\n    <meta property="og:description" content="${escape(description)}" />\n    <meta property="og:url" content="${url}" />\n    <meta property="og:image" content="${copy.origin}/assets/motf-logo-icon.png" />\n    <meta name="twitter:card" content="summary" />\n    <meta name="twitter:title" content="${escape(page.title)}" />\n    <meta name="twitter:description" content="${escape(description)}" />\n    <meta name="twitter:image" content="${copy.origin}/assets/motf-logo-icon.png" />\n    <script type="application/json" id="motfSiteCopy">${json(copy)}</script>\n    ${route==='/'?`<script type="application/ld+json">${json({'@context':'https://schema.org','@type':'WebSite',url:copy.origin+'/',name:'모티프',alternateName:['moTF','motf','모티프(moTF)'],inLanguage:'ko-KR',description:copy.description})}</script>`:''}\n    <!-- motf:metadata:end -->`;
 if(!source.includes('<!-- motf:metadata:start -->'))throw Error('Missing metadata marker');return source.replace(/<!-- motf:metadata:start -->[\s\S]*?<!-- motf:metadata:end -->/,metadata.replace(/^[ \t]+$/gm,''));
}
let count=0;
for(const route of Object.keys(copy.routes)){
  if(route==='/')continue;
  const directory=path.join(root,route.slice(1));
  await fs.mkdir(directory,{recursive:true});
  await fs.writeFile(path.join(directory,'index.html'),shell(route));count++;
}
await fs.writeFile(path.join(root,'index.html'),shell('/'));
console.log(`Synchronized ${count} static route entrypoints with route-specific titles; existing Vercel routing configuration retained.`);
