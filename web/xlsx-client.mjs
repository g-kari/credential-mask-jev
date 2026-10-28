// All parsing/writing is isolated in a fresh, terminable module Worker; no remote code.
function call(operation,args){return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./xlsx-worker.mjs',import.meta.url),{type:'module'});const finish=()=>{clearTimeout(timer);worker.terminate();};const timer=setTimeout(()=>{finish();reject(Error('XLSX処理が時間制限（10秒）を超えました'));},10000);worker.onmessage=({data})=>{finish();data.error?reject(Error(data.error)):resolve(data.result);};worker.onerror=()=>{finish();reject(Error('XLSX処理に失敗しました'));};worker.postMessage({operation,args});});}
export const inspectXlsx=input=>call('inspectXlsx',[input]);
export const importXlsx=(input,selectedSheets,options={})=>call('importXlsx',[input,selectedSheets,options]);
export const exportXlsx=model=>call('exportXlsx',[model]);
export const writeValuesXlsx=sheets=>call('writeValuesXlsx',[sheets]);
