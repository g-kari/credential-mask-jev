from contextlib import redirect_stderr, redirect_stdout
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from credential_mask import MaskingError, mask
from credential_mask.cli import main
from credential_mask.storage import PREVIEW, REPORT, SESSION_MAP, load_session, save_session, write_new


class StorageCliTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.session = self.root / "private-session"
        self.text = "氏名: 架空花子\nmember_id: SYNTHETIC-123\nメール: synthetic@example.invalid\r\n"
        self.result = mask(self.text)

    def tearDown(self):
        self.temp.cleanup()

    def save(self):
        save_session(self.session, self.result, allow_plaintext_map=True, ack_unprotected_storage=True)

    def call(self, args):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = main(args + ["--ack-unprotected-storage"])
        self.assertNotIn("SYNTHETIC-123", out.getvalue() + err.getvalue())
        self.assertNotIn("synthetic@example.invalid", out.getvalue() + err.getvalue())
        return code, out.getvalue(), err.getvalue()

    def test_no_plaintext_persistence_without_explicit_consent(self):
        with self.assertRaises(MaskingError):
            save_session(self.session, self.result)
        self.assertFalse(self.session.exists())

    def test_private_permissions_and_roundtrip(self):
        self.save()
        data, preview = load_session(self.session, ack_unprotected_storage=True)
        self.assertEqual(self.result.restore(preview), self.text)
        self.assertEqual(data["mapping"], self.result.mapping)
        if os.name == "posix":
            self.assertEqual(self.session.stat().st_mode & 0o777, 0o700)
            for name in [PREVIEW, REPORT, SESSION_MAP]:
                self.assertEqual((self.session / name).stat().st_mode & 0o777, 0o600)

    def test_session_and_output_never_overwritten(self):
        self.save()
        with self.assertRaises(MaskingError):
            self.save()
        output = self.root / "existing.txt"
        output.write_text("existing")
        with self.assertRaises(MaskingError):
            write_new(output, "replacement", ack_unprotected_storage=True)
        self.assertEqual(output.read_text(encoding="utf-8"), "existing")

    @unittest.skipUnless(os.name == "posix", "POSIX permission verification")
    def test_public_session_file_rejected(self):
        self.save()
        (self.session / SESSION_MAP).chmod(0o644)
        with self.assertRaises(MaskingError):
            load_session(self.session)

    @unittest.skipUnless(os.name == "posix", "POSIX symlink behavior")
    def test_final_component_symlink_rejected(self):
        target = self.root / "target"
        target.write_text("existing")
        linked = self.root / "link"
        linked.symlink_to(target)
        with self.assertRaises(MaskingError):
            write_new(linked, "replacement")
        self.assertEqual(target.read_text(encoding="utf-8"), "existing")
        self.save()
        map_path = self.session / SESSION_MAP
        content = map_path.read_text(encoding="utf-8")
        map_path.unlink()
        target.write_text(content)
        target.chmod(0o600)
        map_path.symlink_to(target)
        with self.assertRaises(MaskingError):
            load_session(self.session)

    def test_preview_corruption_rejected(self):
        self.save()
        with (self.session / PREVIEW).open("a") as stream:
            stream.write("changed")
        with self.assertRaises(MaskingError):
            load_session(self.session, ack_unprotected_storage=True)

    def test_original_mapping_corruption_rejected(self):
        self.save()
        path = self.session / SESSION_MAP
        value = json.loads(path.read_text(encoding="utf-8"))
        token = next(iter(value["mapping"]))
        value["mapping"][token] = "SYNTHETIC-CORRUPTION"
        path.write_text(json.dumps(value))
        with self.assertRaises(MaskingError):
            load_session(self.session, ack_unprotected_storage=True)

    def test_nonposix_requires_explicit_storage_risk_ack(self):
        with patch("credential_mask.storage.os.name", "nt"), self.assertRaises(MaskingError):
            save_session(self.session, self.result, allow_plaintext_map=True)
        self.assertFalse(self.session.exists())

    def test_cli_prepare_export_restore_end_to_end(self):
        source = self.root / "source.txt"
        source.write_bytes(self.text.encode())
        code, out, _ = self.call(["prepare", "--input", str(source), "--session", str(self.session), "--allow-plaintext-map"])
        self.assertEqual(code, 0)
        self.assertIn("regex-only", out)
        output = self.root / "candidate.masked.txt"
        self.assertEqual(self.call(["export", "--session", str(self.session), "--output", str(output)])[0], 2)
        self.assertFalse(output.exists())
        self.assertEqual(self.call(["export", "--session", str(self.session), "--output", str(output), "--approve-reviewed"])[0], 0)
        restored = self.root / "answer.restored.txt"
        self.assertEqual(self.call(["restore", "--session", str(self.session), "--input", str(output), "--output", str(restored)])[0], 0)
        self.assertEqual(restored.read_bytes(), self.text.encode())

    def test_cli_invalid_map_response_writes_no_restoration(self):
        self.save()
        response = self.root / "response.txt"
        response.write_text("[[CMASK:damaged]]")
        output = self.root / "restored.txt"
        self.assertEqual(self.call(["restore", "--session", str(self.session), "--input", str(response), "--output", str(output)])[0], 2)
        self.assertFalse(output.exists())

    def test_cli_adapter_failure_writes_no_session(self):
        source = self.root / "source.txt"
        source.write_bytes(self.text.encode("utf-8"))
        with patch("credential_mask.cli.detect", side_effect=MaskingError("Local model request failed.")):
            code, _, _ = self.call(["prepare", "--input", str(source), "--session", str(self.session), "--allow-plaintext-map", "--djev-url", "http://127.0.0.1:8011", "--model", "local", "--ack-local-server"])
        self.assertEqual(code, 2)
        self.assertFalse(self.session.exists())

    def test_cli_without_plaintext_flag_writes_nothing(self):
        source = self.root / "source.txt"
        source.write_bytes(self.text.encode("utf-8"))
        self.assertEqual(self.call(["prepare", "--input", str(source), "--session", str(self.session)])[0], 2)
        self.assertFalse(self.session.exists())


if __name__ == "__main__":
    unittest.main()
