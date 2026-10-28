import {inspectXlsx,importXlsx,exportXlsx,writeValuesXlsx} from './xlsx-io.mjs';
const operations={inspectXlsx,importXlsx,exportXlsx,writeValuesXlsx};
self.onmessage=async({data})=>{try{if(!Object.hasOwn(operations,data.operation))throw Error('未対応操作');const result=await operations[data.operation](...data.args);self.postMessage({result});}catch{self.postMessage({error:'XLSXを処理できません。形式・数式・外部参照・容量・非表示内容を確認してください。'});}};
