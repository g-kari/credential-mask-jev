import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Workers deployment is static-only and restricted to the intended hostname', async()=>{
  const c=JSON.parse(await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
  assert.deepEqual(Object.keys(c).sort(),['assets','compatibility_date','name','preview_urls','routes','workers_dev']);
  assert.equal(c.name,'credential-mask-jev');
  assert.equal(c.workers_dev,false);
  assert.equal(c.preview_urls,false);
  assert.deepEqual(c.assets,{directory:'./dist',not_found_handling:'none'});
  assert.deepEqual(c.routes,[{pattern:'mask.0g0.xyz',custom_domain:true}]);
});
