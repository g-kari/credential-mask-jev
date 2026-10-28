import test from 'node:test';import assert from 'node:assert/strict';
import {extractReviewedValues,sheetReviewInventory,cellPosition} from './xlsx-values-adapter.mjs';
test('allowlisted scalar output omits workbook/sheet/cell secrets',()=>{
 const w={SheetNames:['private-name'],Props:{Author:'secret-author'},Workbook:{Sheets:[{Hidden:2}]},Sheets:{'private-name':{A1:{t:'s',v:'001',c:[{t:'secret-comment'}],l:{Target:'secret-link'}},'!rows':[{hidden:true}]}}};
 assert.throws(()=>extractReviewedValues(w,['private-name']));
 assert.deepEqual(extractReviewedValues(w,['private-name'],{includeHidden:true}),[{name:'Sheet1',cells:[{address:'A1',type:'s',value:'001'}]}]);
 assert.equal(sheetReviewInventory(w)[0].hidden,2);assert.equal(sheetReviewInventory(w)[0].hiddenRows,1);
});
test('invalid Excel coordinates and sparse rectangles fail closed',()=>{
 for(const a of ['ZZZ9999999','XFE1','A1048577','A10001','IW1','A0','a1'])assert.throws(()=>cellPosition(a));
 assert.deepEqual(cellPosition('A1'),{row:1,column:1});
 const w={SheetNames:['a'],Sheets:{a:{A1:{t:'s',v:'x'},IV10000:{t:'s',v:'y'}}}};
 assert.throws(()=>extractReviewedValues(w,['a']));
});
test('hidden positions require explicit inclusion; types are retained',()=>{
 const w={SheetNames:['a'],Sheets:{a:{A1:{t:'b',v:false},B1:{t:'n',v:0},C1:{t:'z'},'!cols':[{}, {hidden:true}],'!rows':[{}, {}, {hidden:true}]}}};
 const review=sheetReviewInventory(w)[0];assert.deepEqual(review.hiddenRowPositions,[3]);assert.deepEqual(review.hiddenColumnPositions,[2]);
 assert.throws(()=>extractReviewedValues(w,['a']));
 assert.deepEqual(extractReviewedValues(w,['a'],{includeHidden:true})[0].cells,[{address:'A1',type:'b',value:false},{address:'B1',type:'n',value:0}]);
 w.Sheets.a.A1.F='A1:A2';assert.throws(()=>extractReviewedValues(w,['a'],{includeHidden:true}));
});
test('metadata limits and duplicates fail closed',()=>{
 assert.throws(()=>sheetReviewInventory({SheetNames:['a','a']}));
 assert.throws(()=>sheetReviewInventory({SheetNames:['a'],Sheets:{a:{'!rows':new Array(10001)}}}));
 assert.throws(()=>sheetReviewInventory({SheetNames:['a'],Sheets:{a:{'!cols':new Array(257)}}}));
 assert.throws(()=>extractReviewedValues({SheetNames:['a'],Sheets:{a:{A1:{t:'s',v:'x'.repeat(1000001)}}}},['a']));
});
test('formula and unsupported values rejected rather than copied',()=>{
 for(const c of [{t:'n',v:1,f:'A2'},{t:'d',v:'2026-01-01'},{t:'n',v:Infinity}])assert.throws(()=>extractReviewedValues({SheetNames:['a'],Sheets:{a:{A1:c}}},['a']));
});
