import test from 'node:test';
import assert from 'node:assert/strict';
import {mask,restore,candidates,parseDelimited,serializeDelimited,seal,unseal,validateMap} from './core.mjs';
const nonce='a'.repeat(32);
test('Japanese, emoji, CRLF and repeated longest match roundtrip',()=>{
 const original='山田太郎🙂\r\n山田・山田太郎';const r=mask(original,['山田','山田太郎'],nonce);
 assert.equal(restore(r.output,r.map),original);assert.equal(r.output.split(r.map[0].token).length-1,2);
});
test('literal metacharacters, not regex',()=>{const r=mask('a.b a+b',['a.b'],nonce);assert.equal(restore(r.output,r.map),'a.b a+b');assert.ok(r.output.includes('a+b'));});
test('collision fails closed',()=>assert.throws(()=>mask(`[[MASK_${nonce}_1]]`,['x'],nonce)));
test('reserved markers from other sessions rejected before masking',()=>assert.throws(()=>mask('[[MASK_broken',['x'],nonce)));
test('mask output larger than 1M still restores within 8M bound',()=>{const original='x'.repeat(25000);const r=mask(original,['x'],nonce);assert.ok(r.output.length>1_000_000);assert.equal(restore(r.output,r.map),original);});
test('unknown or damaged marker fails closed',()=>{const r=mask('demo',['demo'],nonce);assert.throws(()=>restore('[[MASK_'+nonce+'_2]]',r.map));assert.throws(()=>restore('[[MASK_broken',r.map));});
test('restoration is not recursive and preserves inert XSS text',()=>{const r=mask('<img onerror=alert(1)>',['<img onerror=alert(1)>'],nonce);assert.equal(restore(r.output,r.map),'<img onerror=alert(1)>');});
test('candidate detection has email and formatted phone',()=>assert.deepEqual(candidates('demo@example.test 090-1111-2222'),['demo@example.test','090-1111-2222']));
test('quoted CSV newline, quotes, empty field and leading zero',()=>assert.deepEqual(parseDelimited('"001","a\r\nb","c""d",\r\n'),[['001','a\r\nb','c"d','']]));
test('malformed CSV rejected',()=>{assert.throws(()=>parseDelimited('"open'));assert.throws(()=>parseDelimited('"a"x'));});
test('TSV and CSV formula safety',()=>{assert.deepEqual(parseDelimited('a\tb\n','\t'),[['a','b']]);assert.equal(serializeDelimited([['=1',' +2','safe']]),'"\'=1","\' +2","safe"');});
test('duplicate mapping and overlimit rejected',()=>{const r=mask('demo',['demo'],nonce);assert.throws(()=>validateMap([...r.map,...r.map]));assert.throws(()=>mask('a'.repeat(1000001),['a'],nonce));});
test('encrypted export roundtrip, wrong password, tamper and KDF bound',async()=>{
 const {map}=mask('synthetic@example.test',['synthetic@example.test'],nonce);
 const sealed=await seal(map,'synthetic-passphrase-123');assert.ok(!sealed.includes('synthetic@example.test'));
 assert.deepEqual(await unseal(sealed,'synthetic-passphrase-123'),map);
 await assert.rejects(unseal(sealed,'another-passphrase-123'));
 const e=JSON.parse(sealed);e.data=(e.data[0]==='A'?'B':'A')+e.data.slice(1);await assert.rejects(unseal(JSON.stringify(e),'synthetic-passphrase-123'));
 e.iterations=999999999;await assert.rejects(unseal(JSON.stringify(e),'synthetic-passphrase-123'));
});
