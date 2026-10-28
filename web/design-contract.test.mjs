import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('./index.html',import.meta.url),'utf8');
test('redesign retains processing controls, labels and local-only policy',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(ids.length,new Set(ids).size,'IDs must be unique');
 for(const id of ['format','file','sheet-panel','sheet-list','include-hidden','select-sheets','workbook-warnings','source','detect','terms','mask','output','download','reply','restore','restored','password','export','import','clear','status'])assert.ok(ids.includes(id),`Missing ${id}`);
 for(const id of ['format','file','source','terms','output','reply','restored','password','import'])assert.ok(html.includes(`for="${id}"`),`Missing explicit label for ${id}`);
 assert.match(html,/connect-src 'none'/);assert.match(html,/worker-src 'self'/);
 assert.match(html,/完全な匿名化ではありません/);assert.match(html,/パスフレーズを忘れると復元できません/);
 assert.match(html,/id="status" role="status" aria-live="polite"/);
 assert.doesNotMatch(html,/<(?:script|link)[^>]+(?:src|href)="https?:/);
});
