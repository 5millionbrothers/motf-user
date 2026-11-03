import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const source=await fs.readFile(path.join(root,'index.html'),'utf8');
let count=0;
async function walk(directory){
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
    if(['.git','node_modules','motf-prototype','api','assets','scripts','tests'].includes(entry.name))continue;
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())await walk(file);
    else if(entry.name==='index.html'&&directory!==root){const current=await fs.readFile(file,'utf8');if(current.includes('motf_user_v11')&&current.includes('id="homeStayPicks"')){await fs.writeFile(file,source);count++;}}
  }
}
await walk(root);console.log(`Synchronized ${count} route entrypoints with the root application shell.`);
