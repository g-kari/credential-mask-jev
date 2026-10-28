import {mask} from './core.mjs';
// Match textarea UTF-16 offsets without normalizing or silently trimming values.
export function selectedTerm(source,start,end,existing){
 if(typeof source!=='string'||source.length>1_000_000||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>source.length||start>=end)throw Error('原文から隠す語句を選択してください');
 const value=source.slice(start,end);
 if(!value.trim()||/[\r\n\t]/u.test(value))throw Error('空白だけ・改行・タブを含む選択は追加できません。1つの語句を選択してください');
 if(value.length>100000)throw Error('指定語は合計10万文字以下にしてください');
 let startBoundary=false,endBoundary=end===source.length;
 for(const segment of new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(source)){if(segment.index===start)startBoundary=true;if(segment.index===end)endBoundary=true;if(segment.index>=end)break;}
 if(!startBoundary||!endBoundary)throw Error('絵文字・結合文字の途中です。文字全体を選択してください');
 const terms=existing.split('\n').filter(Boolean);
 if(terms.includes(value))return {value,terms,added:false};
 const next=[...terms,value];
 if(next.length>500||next.reduce((n,s)=>n+s.length,0)>100000)throw Error('指定語は500件・合計10万文字以下にしてください');
 return {value,terms:next,added:true};
}
export function reviewSegments(source,terms){
 // Explicit preview-only bounds; never silently omit the rest of a document.
 if(source.length>50000)throw Error('ハイライト確認は5万文字以下が対象です。原文・結果を別途照合してください');
 const {map}=mask(source,terms,'00000000000000000000000000000000');
 const segments=[];let plain='',count=0;
 for(let i=0;i<source.length;){
  const entry=map.find(e=>source.startsWith(e.value,i));
  if(entry){if(++count>1000)throw Error('対象が1000箇所を超えます。ハイライトは表示していません');if(plain){segments.push({text:plain,marked:false});plain='';}segments.push({text:entry.value,marked:true});i+=entry.value.length;}
  else plain+=source[i++];
 }
 if(plain)segments.push({text:plain,marked:false});
 return {segments,count,terms:map.length};
}
