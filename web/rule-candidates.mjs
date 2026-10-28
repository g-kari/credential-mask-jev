// Browser-local suggestions, not an identity detector. Always require human review.
export const RULE_LIMIT = 1_000_000;
export const MAX_RULE_CANDIDATES = 500;
export const RULE_METADATA = Object.freeze({
  falsePositives: 'IP風の識別子、敬称付き組織名、住所風の文章を含む場合があります。必ず選択内容を確認してください。',
  missing: '氏名は日本語ラベル・敬称のある限定形式のみ。無記名の氏名、海外住所、改行した住所、町域に数字を含む住所、表記ゆれは検出しない場合があります。IPv6のゾーンIDは対象外です。',
  ambiguous: 'v / version / バージョンに続くIPv4形式はバージョン番号と区別できないため候補にしません。'
});
const validV4 = s => /^(?:\d{1,3}\.){3}\d{1,3}$/.test(s) && s.split('.').every(p => Number(p) <= 255 && (p === '0' || !p.startsWith('0')));
function validV6(s) {
  if (!s.includes(':') || s.includes('%') || s.length > 45 || !/^[0-9a-f:.]+$/i.test(s)) return false;
  if (s.includes('.')) {
    const last = s.lastIndexOf(':');
    if (!validV4(s.slice(last + 1))) return false;
    s = s.slice(0, last + 1) + '0:0';
  }
  const parts = s.split('::');
  if (parts.length > 2) return false;
  const groups = part => part === '' ? [] : part.split(':');
  const all = parts.flatMap(groups);
  if (!all.every(g => /^[0-9a-f]{1,4}$/i.test(g))) return false;
  return parts.length === 2 ? all.length < 8 : all.length === 8;
}
export function ruleCandidates(text) {
  if (typeof text !== 'string' || text.length > RULE_LIMIT) throw Error('入力は100万文字以下にしてください');
  const found = new Map();
  const add = (value, kind, reason) => {
    if (!value || found.has(value)) return;
    if (found.size >= MAX_RULE_CANDIDATES) throw Error('候補が500件を超えています。入力を分割してください');
    found.set(value, {value, kind, reason});
  };
  // Maximal runs avoid quadratic retries on very long near-matches.
  for (const m of text.matchAll(/[A-Z0-9._%+@-]+/gi)) {
    if (m[0].length <= 320 && /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(m[0])) add(m[0], 'email', 'メールアドレス形式');
  }
  for (const m of text.matchAll(/(?:\+81[- ]?|0)\d{1,4}[- ]\d{1,4}[- ]\d{3,4}/g)) add(m[0], 'phone', '区切り付き日本電話番号形式');
  for (const m of text.matchAll(/[A-Za-z0-9_.:%-]+/g)) {
    // Only known IP labels may be removed: arbitrary identifier prefixes stay rejected.
    let s = m[0], offset = 0;
    const label = /^(?:ip|ipv4|ipv6):/i.exec(s);
    if (label) { offset = label[0].length; s = s.slice(offset); }
    // A single terminal full stop is prose punctuation, not a partial invalid IP.
    if (s.endsWith('.') && !/[A-Za-z0-9_.:%-]/.test(text[m.index + m[0].length] ?? '')) s = s.slice(0, -1);
    if (s.length > 51) continue;
    const endpoint = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/.exec(s);
    if (endpoint && Number(endpoint[2]) <= 65535) s = endpoint[1];
    if (validV4(s)) {
      if (/(?:\bv(?:ersion)?\s*[:=]?\s*|バージョン\s*[:：=]?\s*)$/i.test(text.slice(Math.max(0, m.index + offset - 32), m.index + offset))) continue;
      add(s, 'ipv4', 'IPv4形式（識別子との誤検出に注意）');
    } else if (validV6(s)) add(s, 'ipv6', 'IPv6形式（ゾーンIDなし）');
  }
  const jp = '[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}ー々〆ヵヶ]';
  for (const m of text.matchAll(new RegExp('(?:氏名|お名前|担当者)[ \\t]*[:：][ \\t]*(' + jp + '{1,12}(?:[ 　]' + jp + '{1,12})?)(?!' + jp + ')', 'gu'))) add(m[1].replace(/(?:さん|様)$/, ''), 'name', '日本語氏名ラベル（限定ルール・要確認）');
  for (const m of text.matchAll(new RegExp('(?<!' + jp + ')(' + jp + '{2,12}(?:[ 　]' + jp + '{1,12})?)(?:さん|様)(?!' + jp + ')', 'gu'))) add(m[1], 'name', '日本語敬称付き（組織名等の誤検出に注意）');
  for (const m of text.matchAll(/(?<![\dA-Za-z-])(?:〒[ \t]*)?\d{3}-\d{4}(?![\dA-Za-z-])/g)) add(m[0], 'postal', '郵便番号形式（番号のみの場合は要確認）');
  // Explicit prefecture + municipality + bounded street number; never consume a line.
  for (const m of text.matchAll(/(?:東京都|北海道|(?:京都|大阪)府|[一-龯]{2,3}県)[一-龯ぁ-んァ-ヶー々]{1,30}(?:市|区|郡|町|村)[一-龯ぁ-んァ-ヶー々 　]{0,30}?[0-9０-９]{1,5}(?:(?:丁目[0-9０-９]{1,5})?番(?:地[0-9０-９]{0,5}|[0-9０-９]{1,5}号)|[-－][0-9０-９]{1,5}(?:[-－][0-9０-９]{1,5})?)(?![0-9０-９])/g)) add(m[0], 'address', '都道府県・市区町村と番地形式の限定住所');
  return [...found.values()];
}
