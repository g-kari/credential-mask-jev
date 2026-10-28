import {candidates,mask,restore,parseDelimited,serializeDelimited,seal,unseal} from './core.mjs';
import {maskWorkbook,workbookPreview} from './workbook-mask.mjs';
const $=id=>document.getElementById(id);let mapping=[],resultFormat='text',busy=false,workbook=null,selectedSheets=null,maskedWorkbook=null;
const xlsx=()=>import('./xlsx-client.mjs');
const status=s=>{$('status').textContent=s;};
const run=fn=>async()=>{if(busy)return;busy=true;const main=document.querySelector('main');main.inert=true;main.setAttribute('aria-busy','true');try{await fn();}catch(e){status(e.name==='OperationError'?'復号できません。パスフレーズかファイルを確認してください。':e.message);}finally{busy=false;main.inert=false;main.removeAttribute('aria-busy');}};
function save(value,name,type){const url=URL.createObjectURL(new Blob([value],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function dirty(){ $('output').value='';$('restored').value='';$('download').disabled=true;maskedWorkbook=null; }
function resetWorkbook(){workbook=null;selectedSheets=null;$('sheet-panel').hidden=true;$('sheet-list').replaceChildren();$('include-hidden').checked=false;$('source').readOnly=false;}
const previewSheets=workbookPreview;
$('source').addEventListener('input',dirty);$('terms').addEventListener('input',dirty);$('format').addEventListener('change',dirty);
$('format').addEventListener('change',()=>{resetWorkbook();$('source').value='';});
$('reply').addEventListener('input',()=>{$('restored').value='';});
$('file').addEventListener('change',run(async()=>{
  const f=$('file').files[0];if(!f)return;$('source').value='';resetWorkbook();dirty();if(f.size>2_000_000)throw Error('2 MBを超えています。旧入力は消去しました');
  const ext=f.name.split('.').at(-1).toLowerCase();if(!['txt','csv','tsv','xlsx'].includes(ext))throw Error('未対応形式です');
  const bytes=await f.arrayBuffer();
  if(ext==='xlsx'){
    workbook=await (await xlsx()).inspectXlsx(bytes);$('format').value='xlsx';$('source').readOnly=true;$('sheet-panel').hidden=false;
    workbook.sheets.forEach((s,i)=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.dataset.index=String(i);input.checked=!s.hidden;input.addEventListener('change',()=>{selectedSheets=null;$('source').value='';dirty();});label.append(input,document.createTextNode(`${s.name} — 隠し状態${s.hidden}、隠し行: ${(s.hiddenRowPositions??[]).join(',')||'なし'}、隠し列: ${(s.hiddenColumnPositions??[]).join(',')||'なし'}`));$('sheet-list').append(label);});
    $('workbook-warnings').textContent=(workbook.warnings??[]).join(' ');status('シートと隠れた内容を確認し、プレビューしてください。');return;
  }
  $('source').value=new TextDecoder('utf-8',{fatal:true}).decode(bytes);$('format').value=ext==='txt'?'text':ext;dirty();status('読み込みました。候補と未指定情報を確認してください。');
}));
$('include-hidden').addEventListener('change',()=>{selectedSheets=null;$('source').value='';dirty();});
$('select-sheets').onclick=run(()=>{if(!workbook)throw Error('Excelを読み込んでください');const sheets=[...$('sheet-list').querySelectorAll('input:checked')].map(i=>workbook.sheets[Number(i.dataset.index)]);if(!sheets.length)throw Error('シートを選択してください');if(sheets.some(s=>s.hidden||s.hiddenRows||s.hiddenColumns)&&!$('include-hidden').checked)throw Error('隠れた内容を含める確認が必要です');selectedSheets=sheets;$('source').value=previewSheets(sheets);dirty();status('選択した全セルを表示しました。機微情報を指定してください。');});
$('detect').onclick=run(()=>{const set=new Set([...$('terms').value.split('\n'),...candidates($('source').value)]);$('terms').value=[...set].filter(Boolean).join('\n');dirty();status('候補を追加しました。人名・住所などは手動で指定してください。');});
$('mask').onclick=run(()=>{
  if(mapping.length&&!confirm('現在の対応表を新しく作り直します。以前の返答は新しい表では復元できません。必要なら先に暗号化保存してください。'))return;
  const format=$('format').value,raw=$('source').value;
  if(format==='xlsx'&&!selectedSheets)throw Error('Excelのシートを選択してプレビューしてください');
  const rows=['text','xlsx'].includes(format)?null:parseDelimited(raw,format==='csv'?',':'\t');
  const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
  const terms=$('terms').value.split('\n').filter(Boolean);
  // Derive one map from all values; apply it cell by cell without modifying CSV syntax.
  const workbookResult=format==='xlsx'?maskWorkbook(selectedSheets,terms,nonce):null;
  const m=workbookResult??mask(rows?rows.flat().join('\n'):raw,terms,nonce);
  const apply=value=>{let out='';for(let i=0;i<value.length;){const e=m.map.find(e=>value.startsWith(e.value,i));if(e){out+=e.token;i+=e.value.length;}else out+=value[i++];}return out;};
  const book=workbookResult?.workbook??null;
  const output=book?previewSheets(book):rows?serializeDelimited(rows.map(row=>row.map(apply)),format==='csv'?',':'\t'):m.output;
  if(output.length>8_000_000)throw Error('出力が8百万文字を超えます');mapping=m.map;resultFormat=format;$('output').value=output;
  maskedWorkbook=book;$('download').disabled=false;$('restored').value='';status('マスクしました。未指定の情報が残っていないか確認してください。');
});
$('download').onclick=run(async()=>{if(!confirm('原文とマスク後を確認し、未指定の機微情報が残る可能性を理解しました。保存しますか？'))return;if(resultFormat==='xlsx'){if(!maskedWorkbook)throw Error('先にマスクしてください');save(await(await xlsx()).writeValuesXlsx(maskedWorkbook),'masked.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');}else save($('output').value,`masked.${resultFormat==='text'?'txt':resultFormat}`,'text/plain;charset=utf-8');});
$('restore').onclick=run(()=>{$('restored').value='';if(!mapping.length)throw Error('対応表がありません');$('restored').value=restore($('reply').value,mapping);status('登録済みの記号だけ復元しました。');});
$('export').onclick=run(async()=>{try{if(!mapping.length)throw Error('対応表がありません');const encrypted=await seal(mapping,$('password').value);save(encrypted,'private-map.encrypted.json','application/json');status('対応表を暗号化して保存しました。パスフレーズは別に管理してください。');}finally{$('password').value='';}});
$('import').addEventListener('change',run(async()=>{try{const f=$('import').files[0];if(!f)return;if(f.size>8_000_000)throw Error('ファイルが大きすぎます');if(mapping.length&&!confirm('現在の対応表を置き換えますか？'))return;const next=await unseal(await f.text(),$('password').value);mapping=next;dirty();status('対応表を読み込みました。返答を貼り付けて復元できます。');}finally{$('password').value='';$('import').value='';}}));
$('clear').onclick=run(()=>{if(!confirm('入力と対応表を消します。暗号化保存していない対応表は復元できません。続けますか？'))return;mapping=[];resetWorkbook();dirty();for(const id of ['source','terms','output','reply','restored','password','file','import'])$(id).value='';$('download').disabled=true;status('入力と対応表を破棄しました。保存済みファイルは削除していません。');});
window.addEventListener('beforeunload',e=>{if(mapping.length){e.preventDefault();e.returnValue='';}});
