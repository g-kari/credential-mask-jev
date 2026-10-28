// NOT wired to UI; requires a vetted, bundled OOXML parser and bounded ZIP gate.
// This converts an already-parsed workbook into a deliberately minimal values model.
// It does not parse ZIP/XML or write XLSX and must not be advertised as XLSX support.
export function cellPosition(address){
  const m=/^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(address);
  if(!m)throw Error('セル座標が不正です');
  const column=[...m[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0),row=Number(m[2]);
  if(column>16384||row>1048576)throw Error('Excelの座標上限を超えています');
  if(column>256||row>10000)throw Error('この試作の範囲上限（256列・10000行）を超えています');
  return {row,column};
}
function hiddenPositions(items,max){
  if(items===undefined)return [];
  if(!Array.isArray(items)||items.length>max)throw Error('行列メタデータが上限を超えています');
  const positions=[];items.forEach((item,i)=>{if(item?.hidden)positions.push(i+1);});return positions;
}
export function extractReviewedValues(workbook,selectedSheets,{includeHidden=false}={}){
  if(typeof includeHidden!=='boolean')throw Error('隠れた内容の同意値が不正です');
  if(!workbook||!Array.isArray(workbook.SheetNames)||workbook.SheetNames.length>20)throw Error('シート数が不正です');
  if(!Array.isArray(selectedSheets)||selectedSheets.length===0||selectedSheets.some(n=>!workbook.SheetNames.includes(n)))throw Error('シート選択が不正です');
  if(workbook.vbaraw)throw Error('マクロを含むブックは未対応です');
  const inventory=sheetReviewInventory(workbook);
  let count=0,chars=0;
  return [...new Set(selectedSheets)].map((name,index)=>{
    const sheet=workbook.Sheets?.[name];if(!sheet)throw Error('シートがありません');
    const visibility=inventory.find(s=>s.name===name);
    if(!includeHidden&&(visibility.hidden||visibility.hiddenRowPositions.length||visibility.hiddenColumnPositions.length))throw Error('隠れた内容があります。位置を確認し明示的に含める操作が必要です');
    const cells=[];
    let maxRow=0,maxColumn=0;
    for(const address of Object.keys(sheet)){
      if(address.startsWith('!'))continue;
      const position=cellPosition(address);maxRow=Math.max(maxRow,position.row);maxColumn=Math.max(maxColumn,position.column);
      if(maxRow*maxColumn>50000)throw Error('疎なセル範囲が50000枠を超えています');
      const c=sheet[address];if(!c||c.f!==undefined||c.F!==undefined)throw Error('数式セルは未対応です');
      if(c.t==='z')continue;
      if(!['s','n','b'].includes(c.t))throw Error('未対応のセル型です');
      if(c.t==='s'&&typeof c.v!=='string'||c.t==='n'&&(typeof c.v!=='number'||!Number.isFinite(c.v))||c.t==='b'&&typeof c.v!=='boolean')throw Error('セル値が不正です');
      if(++count>50000)throw Error('セル数が上限を超えます');
      chars+=String(c.v).length;if(chars>1000000)throw Error('文字数が上限を超えます');
      // Only scalar values survive; no formulas, comments, links, styles, caches or metadata.
      cells.push({address,type:c.t,value:c.v});
    }
    return {name:`Sheet${index+1}`,cells};
  });
}

export function sheetReviewInventory(workbook){
  if(!workbook||!Array.isArray(workbook.SheetNames)||workbook.SheetNames.length>20)throw Error('シート数が不正です');
  if(new Set(workbook.SheetNames).size!==workbook.SheetNames.length||workbook.SheetNames.some(n=>typeof n!=='string'||n.length>128))throw Error('シート名が不正です');
  return workbook.SheetNames.map((name,i)=>{
    const hidden=workbook.Workbook?.Sheets?.[i]?.Hidden??0;
    if(![0,1,2].includes(hidden))throw Error('シート表示状態が不正です');
    const hiddenRowPositions=hiddenPositions(workbook.Sheets?.[name]?.['!rows'],10000);
    const hiddenColumnPositions=hiddenPositions(workbook.Sheets?.[name]?.['!cols'],256);
    return {name,hidden,hiddenRows:hiddenRowPositions.length,hiddenColumns:hiddenColumnPositions.length,hiddenRowPositions,hiddenColumnPositions};
  });
}
