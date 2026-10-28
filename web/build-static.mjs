import {mkdir,copyFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
export const files=['index.html','style.css','_headers','app.mjs','core.mjs','workbook-mask.mjs','xlsx-values-adapter.mjs','xlsx-io.mjs','xlsx-client.mjs','xlsx-worker.mjs','xlsx-xml-validation.mjs','vendor/xlsx.mjs','vendor/saxes.mjs','vendor/LICENSE-sheetjs.txt','vendor/LICENSE-saxes.txt','vendor/LICENSE-xmlchars.txt','vendor/PROVENANCE.md'];
export async function build(output){
 // Refuse an existing directory rather than accidentally retaining stale/private files.
 for(const file of files){const s=await lstat(path.join(root,file));if(!s.isFile()||s.isSymbolicLink())throw Error('Unexpected runtime asset');}
 await mkdir(output);await mkdir(path.join(output,'vendor'));
 for(const file of files)await copyFile(path.join(root,file),path.join(output,file));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 await build(path.resolve(root,'../dist'));console.log(`Built ${files.length} allowlisted static assets; no originals, mappings, tests or dependencies directory.`);
}
