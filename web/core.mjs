export const LIMIT = 1_000_000;
const check = s => { if (typeof s !== 'string' || s.length > LIMIT) throw Error('入力は100万文字以下にしてください'); return s; };
export function candidates(text) {
  check(text);
  return [...new Set([...text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+81[- ]?|0)\d{1,4}[- ]\d{1,4}[- ]\d{3,4}/gi)].map(m=>m[0]))];
}
export function mask(text, terms, nonce) {
  check(text);
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw Error('識別子が不正です');
  const prefix = `[[MASK_${nonce}_`;
  if (text.includes('[[MASK_')) throw Error('入力に予約済みマスク記号があります。別文書として処理してください');
  const values = [...new Set(terms.map(check).filter(s=>s && text.includes(s)))].sort((a,b)=>b.length-a.length);
  if (values.length > 500 || values.reduce((n,s)=>n+s.length,0)>100000) throw Error('指定語は500件・合計10万文字以下にしてください');
  const map = values.map((value,i)=>({token:`${prefix}${i+1}]]`,value}));
  let output = '';
  for(let i=0;i<text.length;) {
    const entry = map.find(e=>text.startsWith(e.value,i));
    if(entry){output+=entry.token;i+=entry.value.length;} else {output+=text[i++];}
    if(output.length>8_000_000)throw Error('変換結果が8百万文字を超えます');
  }
  return {output,map};
}
export function validateMap(map) {
  if(!Array.isArray(map)||map.length>500) throw Error('対応表が不正です');
  const seen=new Set(); let total=0;
  for(const e of map){
    if(!e||typeof e.token!=='string'||!/^\[\[MASK_[a-f0-9]{32}_[1-9]\d{0,2}\]\]$/.test(e.token)||seen.has(e.token)) throw Error('対応表が不正です');
    check(e.value); if(!e.value) throw Error('空の対応値です'); total+=e.value.length; seen.add(e.token);
  }
  if(total>LIMIT) throw Error('対応表が大きすぎます');
  return map;
}
export function restore(text,map){
  if(typeof text!=='string'||text.length>8_000_000)throw Error('返答が大きすぎます'); validateMap(map);
  const lookup=new Map(map.map(e=>[e.token,e.value]));
  // Recognizable but unknown or malformed markers must not silently look restored.
  const remainder=text.replace(/\[\[MASK_[a-f0-9]{32}_[1-9]\d{0,2}\]\]/g,t=>{if(!lookup.has(t))throw Error('未知のマスク記号があります');return '';});
  if(remainder.includes('[[MASK_'))throw Error('壊れたマスク記号があります');
  let size=text.length;for(const t of text.matchAll(/\[\[MASK_[a-f0-9]{32}_[1-9]\d{0,2}\]\]/g)){size+=lookup.get(t[0]).length-t[0].length;if(size>8_000_000)throw Error('復元結果が大きすぎます');}
  return text.replace(/\[\[MASK_[a-f0-9]{32}_[1-9]\d{0,2}\]\]/g,t=>lookup.get(t)??t);
}
// Strict RFC4180-like parser. All cells remain strings (including leading zeroes).
export function parseDelimited(text,delimiter=',') {
  check(text); if(![',','\t'].includes(delimiter)) throw Error('区切り文字が不正です');
  text=text.replace(/^\uFEFF/,'');
  const rows=[];let row=[],field='',quoted=false,closed=false;
  const push=()=>{row.push(field);field='';closed=false;};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
    if(c===delimiter){push();continue;}
    if(c==='\r'||c==='\n'){push();rows.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;continue;}
    if(closed)throw Error('引用符の後に不正な文字があります');
    if(c==='"'){if(field)throw Error('引用符が不正です');quoted=true;}else field+=c;
  }
  if(quoted)throw Error('引用符が閉じていません');
  if(field||row.length||closed||!rows.length){push();rows.push(row);}
  if(rows.reduce((n,r)=>n+r.length,0)>50000)throw Error('セル数が上限を超えています');
  return rows;
}
export function serializeDelimited(rows,delimiter=',') {
  // Spreadsheet-safe export changes risky cell values intentionally; exact restoration uses text/map.
  return rows.map(row=>row.map(value=>{
    let s=String(value);if(/^[\s\uFEFF]*[=+@-]/u.test(s))s="'"+s;
    return '"'+s.replaceAll('"','""')+'"';
  }).join(delimiter)).join('\r\n');
}
const encode=b=>btoa(String.fromCharCode(...b));
function decode(s,max){if(typeof s!=='string'||s.length>max||!/^[A-Za-z0-9+/]*={0,2}$/.test(s))throw Error('暗号ファイルが不正です');return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
const aad=new TextEncoder().encode('privacy-masker-map:v1');
async function key(password,salt){
  if(typeof password!=='string'||password.length<12||password.length>1024)throw Error('パスフレーズは12〜1024文字にしてください');
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function seal(map,password){
  validateMap(map);const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},await key(password,salt),new TextEncoder().encode(JSON.stringify(map)));
  // Chunked base64 avoids argument-stack limits for larger maps.
  let binary='';for(const byte of new Uint8Array(data))binary+=String.fromCharCode(byte);
  const envelope=JSON.stringify({version:1,kdf:'PBKDF2-SHA256',iterations:600000,salt:encode(salt),iv:encode(iv),data:btoa(binary)});
  if(envelope.length>8_000_000)throw Error('暗号化ファイルが上限を超えます');return envelope;
}
export async function unseal(json,password){
  if(typeof json!=='string'||json.length>8_000_000)throw Error('暗号ファイルが大きすぎます');
  const e=JSON.parse(json);
  if(e.version!==1||e.kdf!=='PBKDF2-SHA256'||e.iterations!==600000)throw Error('未対応の暗号形式です');
  const salt=decode(e.salt,24),iv=decode(e.iv,16),data=decode(e.data,8_000_000);
  if(salt.length!==16||iv.length!==12||data.length<16)throw Error('暗号ファイルが不正です');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad},await key(password,salt),data);
  return validateMap(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain)));
}
