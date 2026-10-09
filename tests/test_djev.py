import json
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError

from credential_mask import MaskingError, mask
from credential_mask.djev import MAX_ITEMS, MAX_MODEL_CHARS, MAX_RESPONSE_BYTES, QUESTIONS, _NoRedirect, detect, local_endpoint, parse_response, request_body


def fixture(text="👩架空花子 会員ID: M-001"):
    body = {"model": "synthetic-local", "answers": {category: {"type": "spans", "found": False, "items": []} for category in QUESTIONS}}
    start = text.index("架空花子")
    body["answers"]["person"] = {"type": "spans", "found": True, "items": [{"text": "架空花子", "start": start, "end": start + 4, "confidence": 0.8, "coverage": 0.99}]}
    return body


class DjevTests(unittest.TestCase):
    def test_actual_documented_systemone_envelope_fixture(self):
        text = "👩架空花子 会員ID: M-001"
        spans = parse_response(text, fixture(text))
        result = mask(text, spans, mode="regex+djev")
        self.assertNotIn("架空花子", result.masked)
        self.assertEqual(result.restore(result.masked), text)

    def test_loopback_only(self):
        for value in ["http://127.0.0.1:8011", "http://[::1]:8011/"]:
            self.assertTrue(local_endpoint(value).endswith("/v1/systemone"))
        for value in ["https://127.0.0.1", "http://localhost", "http://example.invalid", "http://192.168.0.1", "http://0.0.0.0", "http://user:pw@127.0.0.1", "http://127.0.0.1/proxy", "http://127.0.0.1?url=remote", "http://127.0.0.1:0", "file:///tmp/data"]:
            with self.subTest(value=value), self.assertRaises(MaskingError):
                local_endpoint(value)

    def test_no_request_without_local_server_acknowledgement(self):
        with patch("credential_mask.djev.build_opener") as opener, self.assertRaises(MaskingError):
            detect("synthetic", base_url="http://127.0.0.1:8011", model="test")
        opener.assert_not_called()

    def test_invalid_timeout_controlled_before_network(self):
        for timeout in [10**500, float("nan"), 0, True]:
            with patch("credential_mask.djev.build_opener") as opener, self.assertRaises(MaskingError):
                detect("synthetic", base_url="http://127.0.0.1", model="test", acknowledge_local_server=True, timeout=timeout)
            opener.assert_not_called()

    def test_proxy_disabled_and_request_bound_to_source(self):
        text = "👩架空花子 会員ID: M-001"
        response = MagicMock()
        response.status = 200
        response.read.return_value = json.dumps(fixture(text), ensure_ascii=False).encode()
        response.__enter__.return_value = response
        opener = MagicMock()
        opener.open.return_value = response
        with patch("credential_mask.djev.build_opener", return_value=opener) as builder:
            detect(text, base_url="http://127.0.0.1:8011", model="synthetic-local", acknowledge_local_server=True)
        proxy_handler = builder.call_args.args[0]
        self.assertEqual(proxy_handler.proxies, {})
        request = opener.open.call_args.args[0]
        self.assertEqual(request.full_url, "http://127.0.0.1:8011/v1/systemone")
        self.assertEqual(json.loads(request.data)["state"], text)
        self.assertTrue(all(q["type"] == "spans" for q in json.loads(request.data)["questions"].values()))

    def test_redirect_rejected(self):
        with self.assertRaises(MaskingError):
            _NoRedirect().redirect_request(None, None, 302, "Found", {}, "http://example.invalid")

    def test_network_failure_no_fallback_or_response_leak(self):
        for error in [URLError("SYNTHETIC_SECRET_DO_NOT_LOG"), HTTPError("http://127.0.0.1", 500, "SYNTHETIC_SECRET_DO_NOT_LOG", {}, None)]:
            opener = MagicMock()
            opener.open.side_effect = error
            with patch("credential_mask.djev.build_opener", return_value=opener), self.assertRaises(MaskingError) as raised:
                detect("synthetic", base_url="http://127.0.0.1:8011", model="test", acknowledge_local_server=True)
            self.assertNotIn("SYNTHETIC_SECRET", str(raised.exception))
            self.assertIn("no regex-only fallback", str(raised.exception))

    def test_model_input_limit_no_truncation(self):
        with self.assertRaises(MaskingError):
            request_body("x" * (MAX_MODEL_CHARS + 1), "local")

    def test_oversized_response_rejected(self):
        response = MagicMock()
        response.status = 200
        response.read.return_value = b"x" * (MAX_RESPONSE_BYTES + 1)
        response.__enter__.return_value = response
        opener = MagicMock()
        opener.open.return_value = response
        with patch("credential_mask.djev.build_opener", return_value=opener), self.assertRaises(MaskingError):
            detect("synthetic", base_url="http://127.0.0.1", model="test", acknowledge_local_server=True)

    def test_wrong_utf16_offset_and_wrong_source_value_rejected(self):
        text = "👩架空花子 会員ID: M-001"
        for changes in [{"start": 2, "end": 6}, {"text": "架空別人"}, {"start": True}, {"end": 999}]:
            body = fixture(text)
            body["answers"]["person"]["items"][0].update(changes)
            with self.assertRaises(MaskingError):
                parse_response(text, body)

    def test_confidence_and_coverage_fail_closed(self):
        text = "👩架空花子 会員ID: M-001"
        for score in [0.1, True, float("nan"), float("inf"), 10**500, -1, "0.9", None]:
            for field in ["confidence", "coverage"]:
                body = fixture(text)
                body["answers"]["person"]["items"][0][field] = score
                with self.assertRaises(MaskingError):
                    parse_response(text, body)

    def test_missing_question_and_inconsistent_found_rejected(self):
        text = "👩架空花子 会員ID: M-001"
        bodies = [fixture(text), fixture(text), fixture(text)]
        del bodies[0]["answers"]["order_id"]
        bodies[1]["answers"]["person"]["found"] = False
        bodies[2]["answers"]["person"]["type"] = "span"
        for body in bodies:
            with self.assertRaises(MaskingError):
                parse_response(text, body)

    def test_explicit_incomplete_or_failure_metadata_rejected(self):
        text = "👩架空花子 会員ID: M-001"
        for metadata in [{"truncated": True}, {"error": {"message": "SYNTHETIC_SECRET"}}, {"finish_reason": "length"}, {"finish_reason": []}, {"incomplete": "yes"}]:
            body = fixture(text)
            body["diagnostics"] = metadata
            with self.assertRaises(MaskingError):
                parse_response(text, body)

    def test_item_cap_rejected_not_treated_complete(self):
        text = "👩架空花子 会員ID: M-001"
        body = fixture(text)
        body["answers"]["person"]["items"] *= MAX_ITEMS
        with self.assertRaises(MaskingError):
            parse_response(text, body)


if __name__ == "__main__":
    unittest.main()
