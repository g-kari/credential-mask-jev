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

test('studio has real mask/restore/map and narrow-screen document controls',()=>{
 for(const id of ['mask-view','restore-view','map-view'])assert.ok(html.includes(`id="${id}"`));
 for(const value of ['source','terms','output'])assert.ok(html.includes(`data-document="${value}"`));
 assert.match(html,/aria-pressed="true"/);assert.match(html,/class="tool-rail"/);
});

test('rule review and explicit encrypted-map shortcut stay local and deliberate',()=>{
 for(const id of ['candidate-panel','candidate-list','candidate-count','apply-candidates','map-state','map-summary','save-map-shortcut'])assert.ok(html.includes(`id="${id}"`));
 assert.match(html,/誤検出・見逃し/);assert.match(html,/マスク文そのものの暗号化ではありません/);
});
