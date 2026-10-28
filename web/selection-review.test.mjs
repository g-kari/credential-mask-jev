import test from 'node:test';import assert from 'node:assert/strict';
import {selectedTerm,reviewSegments} from './selection-review.mjs';import {mask} from './core.mjs';
test('selection keeps exact whitespace and Unicode, duplicate is non-mutating',()=>{
 const s='前 山田🧑‍💻が 後';const term=' 山田🧑‍💻が ';const start=s.indexOf(term),end=start+term.length;
 const r=selectedTerm(s,start,end,'');assert.equal(r.value,term);assert.equal(r.added,true);
 assert.equal(selectedTerm(s,start,end,term).added,false);
 assert.throws(()=>selectedTerm('🧑‍💻',0,2,''),/文字全体/);assert.throws(()=>selectedTerm('が',0,1,''),/文字全体/);
});
test('empty, multiline, tab, invalid offsets and limits fail explicitly',()=>{
 for(const s of ['  ','\n山田','a\tb'])assert.throws(()=>selectedTerm(s,0,s.length,''));
 for(const range of [[0,0],[-1,1],[0,99],[.5,1]])assert.throws(()=>selectedTerm('abc',...range,''));
 assert.throws(()=>selectedTerm('new',0,3,Array.from({length:500},(_,i)=>String(i)).join('\n')),/500/);
});
test('preview matches core longest-first, preserves markup as literal and all source',()=>{
 const s='<img src=x onerror=alert(1)> 山田太郎 山田 山田太郎';const terms=['山田','山田太郎','<img src=x onerror=alert(1)>'];
 const r=reviewSegments(s,terms);assert.equal(r.count,4);assert.equal(r.segments.map(x=>x.text).join(''),s);
 const m=mask(s,terms,'a'.repeat(32));const out=r.segments.map(x=>x.marked?m.map.find(e=>e.value===x.text).token:x.text).join('');assert.equal(out,m.output);
});
test('preview never truncates or normalizes and caps generated nodes',()=>{
 assert.equal(reviewSegments('が が',['が']).count,1);assert.equal(reviewSegments('abc',[]).count,0);
 assert.throws(()=>reviewSegments('a'.repeat(50001),['a']),/5万/);
 assert.throws(()=>reviewSegments('a'.repeat(1001),['a']),/1000/);
 assert.throws(()=>reviewSegments('[[MASK_unknown',[]),/予約済み/);
});
