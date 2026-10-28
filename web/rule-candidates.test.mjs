import test from 'node:test';
import assert from 'node:assert/strict';
import {ruleCandidates, RULE_METADATA} from './rule-candidates.mjs';
const values = s => ruleCandidates(s).map(c => c.value);
test('synthetic email and formatted phone retained, deduplicated with reasons', () => {
 const out = ruleCandidates('demo@example.test 090-1111-2222 demo@example.test');
 assert.deepEqual(out.map(c => c.kind), ['email', 'phone']);
 assert.ok(out.every(c => c.reason && c.value));
});
test('IPv4 range, exact token boundaries, version ambiguity and leading zeros', () => {
 assert.deepEqual(values('192.0.2.1 255.255.255.255 0.0.0.0'), ['192.0.2.1','255.255.255.255','0.0.0.0']);
 assert.deepEqual(values('999.192.0.2.1 256.0.0.1 192.0.2.1000 x192.0.2.1 192.0.2.1x 01.2.3.4 v1.2.3.4 v 1.2.3.4 version: 1.2.3.4 バージョン：1.2.3.4'), []);
});
test('IPv6 compression, full and embedded IPv4; brackets exclude port', () => {
 for (const s of ['2001:db8::1','::','::1','2001:db8:0:0:0:0:0:1','::ffff:192.0.2.1']) assert.ok(values(s).includes(s), s);
 assert.deepEqual(values('[2001:db8::1]:443'), ['2001:db8::1']);
 for (const s of ['1:2:3','12:34:56','1:2:3:4:5:6:7','1:2:3:4:5:6:7:8:9','1::2::3','1:2:3:4:5:6:7:8::','::ffff:999.0.0.1','fe80::1%eth0','z2001:db8::1','2001:db8::1z']) assert.deepEqual(values(s), [], s);
});
test('bounded Japanese label/honorific suggestions and synthetic addresses', () => {
 const out = values('氏名：試験 太郎\nお名前:架空花子\n担当者：仮名次郎\n試験花子さん\n〒000-0000 東京都架空市試験町1丁目2番地3');
 for (const s of ['試験 太郎','架空花子','仮名次郎','試験花子','〒000-0000','東京都架空市試験町1丁目2番地3']) assert.ok(out.includes(s), s);
 assert.deepEqual(values('無記名の架空太郎\n会議 12:34:56\n東京都について話す'), []);
 assert.ok(RULE_METADATA.falsePositives && RULE_METADATA.missing && RULE_METADATA.ambiguous);
});
test('input and candidate limits fail explicitly; long adversarial runs stay bounded', () => {
 assert.throws(() => ruleCandidates(null));
 assert.throws(() => ruleCandidates('a'.repeat(1_000_001)));
 assert.deepEqual(values('a'.repeat(1_000_000)), []);
 assert.deepEqual(values('あ'.repeat(1_000_000)), []);
 const samples = Array.from({length:501}, (_, i) => `demo${i}@example.test`);
 assert.equal(ruleCandidates(samples.slice(0,500).join(' ')).length, 500);
 assert.throws(() => ruleCandidates(samples.join(' ')), /500/);
});
test('IP labels, valid IPv4 endpoints and prose full stops without partial invalid extraction', () => {
 assert.deepEqual(values('IP:192.0.2.1 IPv4:192.0.2.2:443 IPv6:2001:db8::1 192.0.2.3. 2001:db8::2.'), ['192.0.2.1','192.0.2.2','2001:db8::1','192.0.2.3','2001:db8::2']);
 assert.deepEqual(values('IP:999.192.0.2.1 192.0.2.1:65536 x:192.0.2.1 1.2.3.4.5. version:1.2.3.4 192.0.2.1.. 192.0.2.1:443:444'), []);
});
test('municipality addresses include hyphenated and Japanese street numbering', () => {
 const examples = ['東京都架空市試験町1-2-3','東京都架空市試験町1丁目2番3号','東京都架空市試験町2番地'];
 for (const s of examples) assert.ok(values(s).includes(s), s);
 assert.deepEqual(values('東京都の会議は1-2-3です 東京都1-2-3'), []);
 assert.deepEqual(values('氏名：架空花子様'), ['架空花子']);
});
