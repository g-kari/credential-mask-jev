// Synthetic browser functionality checks. Not a security audit or real-data approval.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {writeValuesXlsx,inspectXlsx,boundedZip,storedZip} from './xlsx-io.mjs';

const base=path.dirname(fileURLToPath(import.meta.url));
const headerText=await fs.readFile(path.join(base,'_headers'),'utf8');
const headers={};let allPaths=false;
for(const line of headerText.split(/\r?\n/)){
 if(!line.trim()||line.trim().startsWith('#'))continue;
 if(!/^\s/.test(line)){assert.equal(line.trim(),'/*','Only the all-path header profile is supported');allPaths=true;continue;}
 assert.ok(allPaths,'Header outside /* profile');const m=/^\s+([^:]+):\s*(.+)$/.exec(line);assert.ok(m,'Malformed _headers line');headers[m[1]]=m[2];
}
for(const name of ['Content-Security-Policy','Referrer-Policy','X-Content-Type-Options','X-Frame-Options','Cache-Control','Permissions-Policy'])assert.ok(headers[name],`Missing ${name}`);
assert.match(headers['Content-Security-Policy'],/worker-src 'self'/);
assert.match(headers['Content-Security-Policy'],/connect-src 'none'/);
assert.match(headers['Content-Security-Policy'],/frame-ancestors 'none'/);
const mime={'.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
 for(const [name,value] of Object.entries(headers))res.setHeader(name,value);
 try{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const file=path.resolve(base,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(base+path.sep)||!mime[path.extname(file)])throw Error('Not a static application file');
  const data=await fs.readFile(file);res.setHeader('Content-Type',mime[path.extname(file)]);res.end(req.method==='HEAD'?undefined:data);
 }catch{res.statusCode=404;res.setHeader('Content-Type','text/plain; charset=utf-8');res.end('not found');}
});
let browser,context,timer;
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin=`http://127.0.0.1:${server.address().port}`;
 const checks=async()=>{
  browser=await chromium.launch({channel:'chrome',headless:true,chromiumSandbox:true,timeout:30000});
  context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true,serviceWorkers:'block'});
  context.setDefaultTimeout(30000);context.setDefaultNavigationTimeout(30000);
  const external=[],pageErrors=[],workers=[];
  await context.route('**/*',route=>{
   const url=route.request().url();
   if(new URL(url).origin!==origin){external.push(url);return route.abort();}
   return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());page.on('worker',worker=>workers.push(worker.url()));
  const response=await page.goto(origin);assert.ok(response?.ok());
  const actualHeaders=await response.allHeaders();for(const [name,value] of Object.entries(headers))assert.equal(actualHeaders[name.toLowerCase()],value);
  const idle=()=>page.waitForFunction(()=>!document.querySelector('main').hasAttribute('aria-busy'));
  const click=async selector=>{await page.locator(selector).click();await idle();};
  const mode=async value=>{await page.locator(`.studio-header [data-mode="${value}"]`).click();};
  const documentView=async value=>{const button=page.locator(`.document-switch [data-document="${value}"]`);if(await button.isVisible())await button.click();};
  for(const [value,ids] of [['restore',['restore']],['map',['export','clear']]]){
   await mode(value);for(const id of ids){const box=await page.locator('#'+id).boundingBox();assert.ok(box&&box.height>=44,`${id} must have a 44px target in its mode`);}
  }
  await page.locator('.skip-link').focus();await page.locator('.skip-link').click();assert.ok(await page.locator('#source').isVisible(),'Skip link opens the source from map mode');
  await documentView('terms');await page.locator('.skip-link').focus();await page.locator('.skip-link').click();assert.ok(await page.locator('#source').isVisible(),'Skip link opens source from narrow terms view');
  await page.locator('#source').fill('[[MASK_reserved');await documentView('terms');await click('#mask');
  assert.match(await page.locator('#status').innerText(),/予約済み/);
  await page.setViewportSize({width:1280,height:900});await page.setViewportSize({width:390,height:844});
  assert.ok(await page.locator('#status').isVisible(),'Mask error stays visible in the active terms pane after resize');
  await documentView('source');
  // Selection-assisted text review: same exact value everywhere, never HTML interpretation.
  const selectionSource='架空🧑‍💻さん と 架空🧑‍💻さん <img src=x onerror=alert(1)>';
  await page.locator('#source').fill(selectionSource);
  await page.locator('#source').evaluate(el=>{el.focus();el.setSelectionRange(0,'架空🧑‍💻さん'.length);});
  await click('#add-selection');assert.equal(await page.locator('#terms').inputValue(),'架空🧑‍💻さん');
  await click('#add-selection');assert.match(await page.locator('#status').innerText(),/追加済み/);
  await click('#review-matches');assert.equal(await page.locator('#review-content mark').count(),2);
  assert.equal(await page.locator('#review-content').textContent(),selectionSource);assert.equal(await page.locator('#review-content img').count(),0);
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:900});await page.locator('#review-panel').scrollIntoViewIfNeeded();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   for(const id of ['add-selection','review-matches'])assert.ok((await page.locator('#'+id).boundingBox()).height>=44);
   await fs.mkdir(path.join(base,'visual-evidence'),{recursive:true});
   await page.screenshot({path:path.join(base,'visual-evidence',`selection-review-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#source').fill('変えた原文');assert.ok(await page.locator('#review-panel').isHidden());assert.equal(await page.locator('#review-content').textContent(),'');
  await page.locator('#source').evaluate(el=>el.setSelectionRange(0,0));await click('#add-selection');assert.match(await page.locator('#status').innerText(),/選択してください/);
  await page.locator('#format').selectOption('csv');await click('#review-matches');assert.match(await page.locator('#status').innerText(),/テキスト形式のみ/);assert.ok(await page.locator('#review-panel').isHidden());
  await page.locator('#format').selectOption('text');
  await documentView('terms');await page.locator('#terms').fill('');await documentView('source');
  const original='合成人名サンプルです。synthetic@example.test\n電話090-1111-2222';
  await page.locator('#source').fill(original);await documentView('terms');await click('#detect');
  await page.locator('#terms').fill((await page.locator('#terms').inputValue())+'\n合成人名サンプル');await click('#mask');
  let masked=await page.locator('#output').inputValue();assert.ok(await page.locator('#status').isVisible(),'Mask status remains in the active narrow result view');
  // Synthetic-only visual evidence, kept out of the static build allowlist.
  await fs.mkdir(path.join(base,'visual-evidence'),{recursive:true});
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:900});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page must not overflow horizontally');
   if(width<720){
    const brand=await page.locator('.brand').boundingBox(),utility=await page.locator('.header-utility').boundingBox(),switcher=await page.locator('.mode-switch').boundingBox();
    assert.ok(brand.x+brand.width<=utility.x+1,'Brand and mapping utility must not overlap');
    assert.ok(switcher.y>=brand.y+brand.height,'Mobile mode switch has its own row');
    assert.equal(await page.locator('.mode-switch button').first().evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');
   }
   for(const id of ['mask','detect','download']){
    if(!await page.locator('#'+id).isVisible())continue;
    const box=await page.locator('#'+id).boundingBox();assert.ok(box&&box.height>=44,`${id} must have a 44px touch target`);
   }
   const focusTarget=width<720?'#download':'#mask';await page.locator(focusTarget).focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
   assert.ok(await page.locator(focusTarget).evaluate(el=>{const s=getComputedStyle(el);return s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>=2;}),'Keyboard focus must remain visible');
   if(width>=1100){
    const sourceBox=await page.locator('#source').boundingBox(),outputBox=await page.locator('#output').boundingBox();
    assert.ok(Math.abs(sourceBox.y-outputBox.y)<2,'Source and result text start on the same baseline');
    assert.ok(Math.abs(sourceBox.height-outputBox.height)<2,'Document editing areas have equal heights');
   }
   await page.screenshot({path:path.join(base,'visual-evidence',`workspace-${width}.png`),fullPage:true});
  }
  await page.setViewportSize({width:390,height:844});
  // Switching modes repeatedly must preserve documents and the live map.
  await mode('map');await mode('mask');await mode('restore');await mode('mask');
  assert.equal(await page.locator('#source').inputValue(),original);assert.equal(await page.locator('#output').inputValue(),masked);
  await mode('restore');
  for(const term of ['合成人名サンプル','synthetic@example.test','090-1111-2222'])assert.ok(!masked.includes(term));
  assert.ok(masked.includes('[[MASK_'));
  await page.locator('#reply').fill(masked);await click('#restore');assert.equal(await page.locator('#restored').inputValue(),original);
  await page.locator('#reply').fill('[[MASK_broken');assert.equal(await page.locator('#restored').inputValue(),'');
  await click('#restore');assert.equal(await page.locator('#restored').inputValue(),'');
  assert.ok(await page.locator('#status').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'Restore error feedback must be in the viewport');
  await mode('map');await page.locator('#password').fill('synthetic-passphrase');
  const encryptedPromise=page.waitForEvent('download');await click('#export');const encrypted=await encryptedPromise;
  assert.equal(encrypted.suggestedFilename(),'private-map.encrypted.json');assert.equal(await page.locator('#password').inputValue(),'');
  const encryptedPath=await encrypted.path();assert.ok(encryptedPath);
  const encryptedText=await fs.readFile(encryptedPath,'utf8');assert.ok(!encryptedText.includes('synthetic@example.test'));
  await page.locator('#password').fill('incorrect-passphrase');await page.locator('#import').setInputFiles(encryptedPath);await idle();
  assert.equal(await page.locator('#password').inputValue(),'');assert.match(await page.locator('#status').innerText(),/復号できません/);
  await click('#clear');assert.equal(await page.locator('#source').inputValue(),'');assert.ok(await page.locator('#download').isDisabled());
  await page.locator('#password').fill('synthetic-passphrase');await page.locator('#import').setInputFiles(encryptedPath);await idle();
  assert.equal(await page.locator('#password').inputValue(),'');assert.match(await page.locator('#status').innerText(),/読み込みました/);
  await mode('restore');await page.locator('#reply').fill(masked);await click('#restore');assert.equal(await page.locator('#restored').inputValue(),original);
  await mode('mask');await documentView('source');
  // Editing input invalidates both visible output and downloadable workbook state.
  await page.locator('#source').fill('new synthetic input');assert.equal(await page.locator('#output').inputValue(),'');assert.equal(await page.locator('#restored').inputValue(),'');assert.ok(await page.locator('#download').isDisabled());
  await mode('map');await click('#clear');await mode('mask');await documentView('source');

  // Fixture uses the application's runtime writer, then edits bounded OOXML bytes only.
  const seeds=['合成氏名エクセル','xlsx@example.test','隠し合成氏名'];
  const fixture=await writeValuesXlsx([{rows:[[seeds[0],seeds[1],0,false,'001','日本語\n改行']]},{rows:[[seeds[2],42,true]]}]);
  const enc=new TextEncoder(),dec=new TextDecoder();
  const entries=(await boundedZip(fixture)).map(([name,bytes])=>{
   let xml=dec.decode(bytes);
   if(name==='xl/workbook.xml')xml=xml.replace('name="Sheet2"','name="Sheet2" state="veryHidden"');
   if(name==='xl/worksheets/sheet1.xml')xml=xml.replace('<row r="1"','<row hidden="1" r="1"');
   return [name,enc.encode(xml)];
  });
  const upload=storedZip(entries);
  await page.locator('#file').setInputFiles({name:'synthetic.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(upload)});await idle();
  await page.locator('#sheet-panel').waitFor({state:'visible'});assert.equal(await page.locator('#format').inputValue(),'xlsx');
  const sheets=page.locator('#sheet-list input');assert.equal(await sheets.count(),2);assert.equal(await sheets.nth(1).isChecked(),false);
  assert.match(await page.locator('#sheet-list').innerText(),/隠し状態2/);assert.match(await page.locator('#sheet-list').innerText(),/隠し行: 1/);
  await sheets.nth(1).check();await click('#select-sheets');assert.match(await page.locator('#status').innerText(),/確認が必要/);assert.equal(await page.locator('#source').inputValue(),'');
  await page.locator('#include-hidden').check();await click('#select-sheets');const preview=await page.locator('#source').inputValue();for(const seed of seeds)assert.ok(preview.includes(seed));
  await documentView('terms');await page.locator('#terms').fill(seeds.join('\n'));await click('#mask');const xlsxMasked=await page.locator('#output').inputValue();for(const seed of seeds)assert.ok(!xlsxMasked.includes(seed));
  const xlsxDownloadPromise=page.waitForEvent('download');await click('#download');const downloaded=await xlsxDownloadPromise;
  assert.equal(downloaded.suggestedFilename(),'masked.xlsx');const downloadedPath=await downloaded.path();assert.ok(downloadedPath);
  const outputBytes=new Uint8Array(await fs.readFile(downloadedPath));
  const inspected=await inspectXlsx(outputBytes);assert.equal(inspected.sheets.length,2);assert.equal(inspected.sheets[0].name,'Sheet1');assert.equal(inspected.sheets[1].name,'Sheet2');
  const first=inspected.sheets[0].rows[0];assert.equal(first[2],0);assert.equal(first[3],false);assert.equal(first[4],'001');assert.equal(first[5],'日本語\n改行');
  assert.equal(inspected.sheets[1].rows[0][1],42);assert.equal(inspected.sheets[1].rows[0][2],true);
  for(const sheet of inspected.sheets){assert.equal(sheet.hidden,0);assert.deepEqual(sheet.hiddenRowPositions,[]);assert.deepEqual(sheet.hiddenColumnPositions,[]);}
  const unzipped=(await boundedZip(outputBytes)).map(([,bytes])=>dec.decode(bytes)).join('\n');for(const seed of seeds)assert.ok(!unzipped.includes(seed));
  assert.ok(workers.some(url=>url===origin+'/xlsx-worker.mjs'),'Actual local XLSX Worker was created');
  await documentView('source');await page.locator('#file').setInputFiles({name:'unsupported.bin',mimeType:'application/octet-stream',buffer:Buffer.from('synthetic invalid input')});await idle();
  assert.match(await page.locator('#status').innerText(),/未対応形式/);assert.equal(await page.locator('#source').inputValue(),'');assert.equal(await page.locator('#output').inputValue(),'');assert.ok(await page.locator('#download').isDisabled());
  await mode('map');await click('#clear');assert.equal(await page.locator('#sheet-panel').isHidden(),true);assert.equal(await page.locator('#source').inputValue(),'');assert.equal(await page.locator('#password').inputValue(),'');assert.ok(await page.locator('#download').isDisabled());
  assert.equal(await page.evaluate(()=>localStorage.length),0);assert.equal(await page.evaluate(()=>sessionStorage.length),0);
  assert.deepEqual(external,[],'Unexpected outbound request attempt');assert.deepEqual(pageErrors,[]);
  console.log('PASS: response headers, mobile text mask/restore, stale/error clearing, encrypted map correct/wrong passwords, reset, actual XLSX Worker hidden consent and downloaded values/type checks; no external request attempts or Web Storage entries observed.');
 };
 await Promise.race([checks(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser checks exceeded 90 seconds')),90000);})]);
}finally{
 clearTimeout(timer);
 try{await context?.close();}finally{
  try{await browser?.close();}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 }
}
