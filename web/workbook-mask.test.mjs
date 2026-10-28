import test from 'node:test';import assert from 'node:assert/strict';
import {maskWorkbook} from './workbook-mask.mjs';import {restore} from './core.mjs';
test('all selected sheets share exact token and generic names; unchanged scalar types retained',()=>{
 const r=maskWorkbook([{name:'private-name',rows:[['合成人名',12,false,null]]},{name:'other',rows:[['合成人名','001']]}],['合成人名'],'a'.repeat(32));
 assert.equal(r.workbook[0].rows[0][0],r.workbook[1].rows[0][0]);assert.equal(restore(r.workbook[0].rows[0][0],r.map),'合成人名');assert.equal(r.workbook[0].rows[0][1],12);assert.equal(r.workbook[0].rows[0][2],false);assert.equal(r.workbook[0].rows[0][3],null);assert.equal(r.workbook[1].rows[0][1],'001');assert.equal(r.workbook[0].name,'Sheet1');
});
test('masked numeric values become string tokens, no number coercion on restore',()=>{const r=maskWorkbook([{rows:[[12345]]}],['12345'],'b'.repeat(32));assert.equal(typeof r.workbook[0].rows[0][0],'string');assert.equal(restore(r.workbook[0].rows[0][0],r.map),'12345');});
