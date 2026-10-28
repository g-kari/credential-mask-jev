import {mask,serializeDelimited} from './core.mjs';
export function workbookPreview(sheets){return sheets.map((s,i)=>`Sheet${i+1}\n`+serializeDelimited(s.rows.map(r=>r.map(v=>v===null?'':String(v))),'\t')).join('\n\n');}
export function maskWorkbook(sheets,terms,nonce){
 const input=sheets.flatMap(s=>s.rows.flat()).filter(v=>v!==null).join('\n');
 const {map}=mask(input,terms,nonce);
 const apply=value=>{let result='';for(let i=0;i<value.length;){const e=map.find(e=>value.startsWith(e.value,i));if(e){result+=e.token;i+=e.value.length;}else result+=value[i++];if(result.length>8_000_000)throw Error('出力が大きすぎます');}return result;};
 const workbook=sheets.map((s,i)=>({name:`Sheet${i+1}`,rows:s.rows.map(r=>r.map(v=>{if(v===null)return null;const changed=apply(String(v));return changed===String(v)?v:changed;}))}));
 const output=workbookPreview(workbook);if(output.length>8_000_000)throw Error('出力が大きすぎます');
 return {map,workbook,output};
}
