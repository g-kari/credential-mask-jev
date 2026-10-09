import json
import unittest
from unittest.mock import patch

from credential_mask import MaskingError, Span, mask, restore, source_digest
from credential_mask.core import MAX_SOURCE_BYTES, TOKEN_RE, merge_spans
from credential_mask.cli import manual_spans
from credential_mask.identifiers import identifier_spans
from credential_mask.jsonio import loads


class CoreTests(unittest.TestCase):
    def test_japanese_exact_roundtrip(self):
        text = "👩🏽‍💻 氏名: 架空花子\r\nメール: hanako@example.invalid\r\n電話: 090-1234-5678\n会員ID: M-001\n注文番号: O-123\nパスワード: '架空秘密e\u0301'\n"
        start = text.index("架空花子")
        result = mask(text, [Span(start, start + 4, "person")], mode="regex+manual")
        self.assertEqual(result.restore(result.masked), text)
        self.assertNotIn("架空花子", result.masked)
        self.assertNotIn("hanako@example.invalid", result.masked)
        self.assertNotIn("架空秘密", result.masked)

    def test_same_type_value_is_stable_but_different_type_separate(self):
        text = '会員ID: 123\n注文番号: 123\n会員ID: 123\n顧客番号: 123\n'
        tokens = TOKEN_RE.findall(mask(text).masked)
        self.assertEqual(tokens[0], tokens[2])
        self.assertEqual(len(set(tokens)), 3)

    def test_json_relationships_and_plain_numbers(self):
        text = json.dumps({"member_id": "M-99", "order_id": "O-88", "count": 12, "price": 500, "rows": [{"member_id": "M-99", "order_id": "O-89"}]})
        result = mask(text)
        value = json.loads(result.masked)
        self.assertEqual(value["member_id"], value["rows"][0]["member_id"])
        self.assertNotEqual(value["order_id"], value["rows"][0]["order_id"])
        self.assertEqual(value["count"], 12)
        self.assertEqual(value["price"], 500)
        self.assertEqual(result.restore(result.masked), text)

    def test_numeric_json_id_is_text_candidate_not_valid_json(self):
        result = mask('{"id":123,"count":42}')
        self.assertNotIn('"id":123', result.masked)
        self.assertIn('"count":42', result.masked)
        self.assertEqual(result.review_report()["ambiguous_identifier_count"], 1)
        self.assertEqual(result.restore(result.masked), '{"id":123,"count":42}')

    def test_generic_id_is_ambiguous_review(self):
        result = mask("id: 42\n個数: 42")
        self.assertEqual(result.review_report()["ambiguous_identifier_count"], 1)
        self.assertIn("個数: 42", result.masked)

    def test_same_value_different_document_unlinkable(self):
        self.assertNotEqual(mask("会員ID: A-42").masked, mask("会員ID: A-42").masked)

    def test_secret_assignment_preserves_label_only(self):
        text = '"api_key": "SYNTHETIC_ONLY_000"\nパスワード：架空パスワード'
        result = mask(text)
        self.assertNotIn("SYNTHETIC_ONLY_000", result.masked)
        self.assertNotIn("架空パスワード", result.masked)
        self.assertEqual(result.restore(result.masked), text)

    def test_known_provider_shapes(self):
        values = ["AKIA" + "0" * 16, "ghp_" + "a" * 36, "sk-proj-" + "b" * 30, "xoxb-" + "0-" * 15]
        text = "\n".join(values)
        result = mask(text)
        for value in values:
            self.assertNotIn(value, result.masked)
        self.assertEqual(result.restore(result.masked), text)

    def test_bearer_jwt_and_url_credentials(self):
        text = "Authorization: Bearer synthetic-token-000\nhttps://fakeuser:fakepass@example.invalid\neyJ" + "a" * 10 + "." + "b" * 10 + "." + "c" * 10
        result = mask(text)
        self.assertNotIn("synthetic-token-000", result.masked)
        self.assertNotIn("fakeuser:fakepass", result.masked)
        self.assertNotIn("eyJaaaa", result.masked)
        self.assertEqual(result.restore(result.masked), text)

    def test_private_key_full_block(self):
        text = "-----BEGIN PRIVATE KEY-----\nSYNTHETIC-NOT-A-KEY\n-----END PRIVATE KEY-----"
        result = mask(text)
        self.assertNotIn("SYNTHETIC-NOT-A-KEY", result.masked)
        self.assertEqual(result.restore(result.masked), text)

    def test_overlap_union_never_reveals_any_candidate(self):
        text = "abcdefghij"
        result = mask(text, [Span(1, 5), Span(3, 9), Span(4, 6)])
        self.assertEqual(result.spans[0].start, 1)
        self.assertEqual(result.spans[0].end, 9)
        self.assertEqual(result.restore(result.masked), text)
        self.assertEqual(result.masked[0], "a")
        self.assertEqual(result.masked[-1], "j")

    def test_touching_spans_remain_separate(self):
        self.assertEqual(len(merge_spans("abcd", [Span(0, 2), Span(2, 4)])), 2)

    def test_utf16_offset_must_not_be_used(self):
        text = "👩山田"
        # Manual offsets are code points: emoji 0, 山 1, 田 2.
        result = mask(text, [Span(1, 3, "person")])
        self.assertTrue(result.masked.startswith("👩[[CMASK:"))
        self.assertEqual(result.restore(result.masked), text)

    def test_invalid_offset_failures(self):
        for span in [Span(-1, 1), Span(0, 0), Span(0, 99), Span(True, 2), Span(0, 1, "原文")]:
            with self.subTest(span=span), self.assertRaises(MaskingError):
                mask("abc", [span])

    def test_reserved_marker_collision(self):
        for text in ["[[CMASK:already-here]]", "[[ cmask broken", "CMASK:broken"]:
            with self.assertRaises(MaskingError):
                mask(text)

    def test_random_token_collision_retry(self):
        with patch("credential_mask.core.secrets.token_hex", side_effect=["a" * 32, "b" * 16, "b" * 16, "c" * 16]):
            result = mask("会員ID: 1\n注文番号: 2")
        self.assertEqual(len(result.mapping), 2)
        self.assertEqual(result.restore(result.masked), "会員ID: 1\n注文番号: 2")

    def test_unknown_and_damaged_tokens_block(self):
        result = mask("会員ID: 1")
        token = next(iter(result.mapping))
        cases = [token.replace("CMASK:", "cmask:"), token[:-2], "[[CMASK:" + "0" * 32 + ":" + "0" * 16 + "]]", token.replace("]]"," ]]")]
        for text in cases:
            with self.assertRaises(MaskingError):
                result.restore(text)

    def test_model_can_omit_or_repeat_known_token(self):
        result = mask("会員ID: 1")
        token = next(iter(result.mapping))
        self.assertEqual(result.restore("No relevant records."), "No relevant records.")
        self.assertEqual(result.restore(token + " / " + token), "1 / 1")

    def test_no_recursive_restore(self):
        with self.assertRaises(MaskingError):
            restore("plain", {"[[CMASK:" + "a" * 32 + ":" + "b" * 16 + "]]": "[[CMASK:bad]]"})

    def test_oversized_input_not_truncated(self):
        with self.assertRaises(MaskingError):
            mask("x" * (MAX_SOURCE_BYTES + 1))

    def test_restore_amplification_bound(self):
        token = "[[CMASK:" + "a" * 32 + ":" + "b" * 16 + "]]"
        with self.assertRaises(MaskingError):
            restore(token * 9, {token: "x" * MAX_SOURCE_BYTES})

    def test_manual_source_binding(self):
        text = "氏名: 架空花子"
        value = {"source_sha256": source_digest(text), "spans": [{"start": 4, "end": 8, "category": "person"}]}
        self.assertEqual(manual_spans(text, value), [Span(4, 8, "person", "manual")])
        with self.assertRaises(MaskingError):
            manual_spans(text + "!", value)

    def test_custom_domain_keys_and_formats(self):
        rules = {"keys": {"contract_id": ["契約番号"]}, "formats": [{"category": "member_id", "prefix": "MEM-", "alphabet": "0123456789", "min_suffix": 4, "max_suffix": 4}]}
        text = "契約番号: C-001\nレコード: MEM-1234\n長すぎる: MEM-12345\n個数: 1234"
        result = mask(text, rules=rules)
        self.assertNotIn("C-001", result.masked)
        self.assertNotIn("レコード: MEM-1234", result.masked)
        self.assertIn("MEM-12345", result.masked)
        self.assertIn("個数: 1234", result.masked)
        self.assertEqual(result.restore(result.masked), text)

    def test_invalid_domain_config_fail_closed(self):
        for config in [[], {"regex": "(a+)+"}, {"keys": {"BAD": ["x"]}}, {"formats": [{}]}]:
            with self.assertRaises(MaskingError):
                identifier_spans("abc", config)

    def test_long_id_not_partially_masked(self):
        text = "order_id: " + "x" * 1000
        result = mask(text)
        self.assertNotIn("x", result.masked)
        self.assertEqual(result.restore(result.masked), text)

    def test_escaped_quoted_secret_and_id_full_value(self):
        for key in ["password", "member_id", "注文番号"]:
            text = key + ': "foo\\\"BARSECRET\\\\tail"'
            result = mask(text)
            self.assertNotIn("BARSECRET", result.masked)
            self.assertNotIn("tail", result.masked)
            self.assertEqual(result.restore(result.masked), text)

    def test_unfinished_recognized_quotes_and_key_blocks_stop(self):
        for text in ['password: "unfinished', 'member_id: "unfinished\nnext', "-----BEGIN PRIVATE KEY-----\nSYNTHETIC-NO-END"]:
            with self.assertRaises(MaskingError):
                mask(text)

    def test_quoted_sentinel_ids_are_masked(self):
        result = mask('member_id: "null"\ncustomer_id: "NONE"\norder_id: "TRUE"\nmember_id: null')
        self.assertNotIn('"null"', result.masked)
        self.assertNotIn('"NONE"', result.masked)
        self.assertNotIn('"TRUE"', result.masked)
        self.assertIn("member_id: null", result.masked)

    def test_broad_llm_span_preserves_repeated_typed_ids(self):
        text = "会員ID: M-001\n注文番号: M-001\n会員ID: M-001"
        result = mask(text, [Span(0, len(text), "sensitive", "djev")], mode="regex+djev")
        member_tokens = [token for token, original in result.mapping.items() if original == "M-001"]
        self.assertEqual(len(member_tokens), 2)
        occurrences = sorted(result.masked.count(t) for t in member_tokens)
        self.assertEqual(occurrences, [1, 2])
        self.assertEqual(result.restore(result.masked), text)

    def test_large_marker_free_input(self):
        text = "a" * MAX_SOURCE_BYTES
        result = mask(text)
        self.assertEqual(result.masked, text)

    def test_nested_label_like_text_in_long_quoted_values(self):
        for key in ["member_id", "password"]:
            text = key + ':"' + (key + ":.") * 20_000 + '"'
            result = mask(text)
            self.assertEqual(result.restore(result.masked), text)
            self.assertEqual(len(result.spans), 1)

    def test_report_does_not_include_originals(self):
        result = mask("会員ID: SYNTHETIC-ONLY-999")
        report = json.dumps(result.review_report())
        self.assertNotIn("SYNTHETIC-ONLY-999", report)
        self.assertIn('"complete_anonymization": false', report)

    def test_regex_only_known_japanese_name_miss_is_explicit(self):
        result = mask("担当: 架空花子。秘密案件: 月面計画")
        self.assertIn("架空花子", result.masked)
        self.assertIn("月面計画", result.masked)
        self.assertEqual(result.mode, "regex-only")
        self.assertTrue(result.review_report()["review_required"])

    def test_llm_additions_cannot_unmask_email(self):
        result = mask("a@example.invalid", [], mode="regex+djev")
        self.assertNotIn("a@example.invalid", result.masked)

    def test_json_duplicate_and_nonfinite_rejected(self):
        for value in ['{"a":1,"a":2}', '{"a":NaN}', '{"a":Infinity}', '{"a":']:
            with self.assertRaises(MaskingError):
                loads(value)


if __name__ == "__main__":
    unittest.main()
