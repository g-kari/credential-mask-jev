import {SaxesParser} from './vendor/saxes.mjs';
import {cellPosition} from './xlsx-values-adapter.mjs';
const invalid=()=>{throw Error('XLSX XMLの構文・属性・範囲が未対応または不正です');};
const geometry={
 col:new Set(['min','max','width','style','hidden','bestFit','customWidth','phonetic','outlineLevel','collapsed']),
 row:new Set(['r','s','customFormat','ht','hidden','customHeight','outlineLevel','collapsed','thickTop','thickBot','ph','spans']),
 c:new Set(['r','s','t','cm','vm','ph']),
 dimension:new Set(['ref'])
};
const positive=(value,max)=>{if(typeof value!=='string'||!(/^[1-9]\d*$/.test(value))||Number(value)>max)invalid();return Number(value);};
// Existing strict SAX parser, not a home-grown XML tokenizer. All errors abort before SheetJS.
export function validateXlsxXml(xml,part){
 const parser=new SaxesParser({xmlns:true,position:false});let depth=0,elements=0,sheets=0;
 parser.on('error',invalid);parser.on('doctype',invalid);
 // The downstream reader uses regexes: reject inert markup containers it could misinterpret.
 parser.on('comment',invalid);parser.on('cdata',invalid);parser.on('processinginstruction',invalid);
 parser.on('opentag',tag=>{
  if(++depth>64||++elements>300000)invalid();
  const isWorksheet=/^xl\/worksheets\/sheet\d+\.xml$/.test(part);
  if(isWorksheet){
   // SheetJS interprets local tag/attribute names permissively. Do not allow case/prefix aliases.
   const local=tag.local;
   if(Object.keys(geometry).some(n=>n.toLowerCase()===local.toLowerCase())){
    if(!Object.hasOwn(geometry,local)||tag.prefix)invalid();
    const attrs=Object.create(null);
    for(const a of Object.values(tag.attributes)){
     if(a.uri==='http://www.w3.org/2000/xmlns/')continue;
     if(a.name==='xml:space'&&a.uri==='http://www.w3.org/XML/1998/namespace'&&['preserve','default'].includes(a.value))continue;
     if(a.prefix||!geometry[local].has(a.name))invalid();attrs[a.name]=a.value;
    }
    if(local==='col'){const min=positive(attrs.min,256),max=positive(attrs.max,256);if(min>max)invalid();}
    if(local==='row')positive(attrs.r,10000);
    if(local==='c')cellPosition(attrs.r);
    if(local==='dimension'){
     if(typeof attrs.ref!=='string')invalid();const range=attrs.ref.split(':');if(range.length>2)invalid();
     for(const value of range){const p=cellPosition(value);if(p.row*p.column>50000)invalid();}
    }
   }
  }
  if(part==='xl/workbook.xml'&&tag.local==='sheet'&&++sheets>20)invalid();
 });
 parser.on('closetag',()=>{depth--;});
 parser.write(xml).close();
}
