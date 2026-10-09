"""Explicit plaintext persistence. It is NOT encrypted storage."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import stat

from .core import MAX_SOURCE_BYTES, MaskingError, MaskingResult, restore, source_digest, validate_mapping
from .jsonio import loads

SESSION_MAP = "originals.mask-map.json"
PREVIEW = "candidate.txt"
REPORT = "review.json"
MAX_LOCAL_BYTES = MAX_SOURCE_BYTES * 16


def require_platform(ack_unprotected_storage: bool = False):
    if os.name != "posix" and not ack_unprotected_storage:
        raise MaskingError("This platform cannot verify POSIX file protection; use memory-only API or explicitly acknowledge unprotected storage.")


def read_text(path: Path, *, private: bool = False, ack_unprotected_storage: bool = False) -> str:
    require_platform(ack_unprotected_storage) if private else None
    try:
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        with os.fdopen(descriptor, "rb") as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode):
                raise MaskingError("Input must be a regular local file.")
            if private and os.name == "posix" and info.st_mode & 0o077:
                raise MaskingError("Session files must not be accessible to group or other users.")
            raw = stream.read(MAX_LOCAL_BYTES + 1)
            if len(raw) > MAX_LOCAL_BYTES:
                raise MaskingError("Local file exceeds the read limit.")
        return raw.decode("utf-8")
    except (OSError, UnicodeError):
        raise MaskingError("Cannot read the local UTF-8 file; no file contents were logged.") from None


def write_new(path: Path, text: str, *, ack_unprotected_storage: bool = False):
    require_platform(ack_unprotected_storage)
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            if os.name == "posix" and os.fstat(stream.fileno()).st_mode & 0o077:
                raise MaskingError("Filesystem did not honor private file permissions.")
            stream.write(text.encode("utf-8"))
            stream.flush()
            os.fsync(stream.fileno())
    except OSError:
        raise MaskingError("Cannot create a new output file; existing files are never overwritten.") from None


def save_session(path: Path, result: MaskingResult, *, allow_plaintext_map: bool = False, ack_unprotected_storage: bool = False):
    if not allow_plaintext_map:
        raise MaskingError("Persistence requires explicit consent: the local map contains original secrets in plaintext.")
    require_platform(ack_unprotected_storage)
    mapping = {
        "version": 1,
        "source_sha256": result.source_sha256,
        "preview_sha256": source_digest(result.masked),
        "mode": result.mode,
        "mapping": result.mapping,
    }
    try:
        path.mkdir(mode=0o700)
    except OSError:
        raise MaskingError("Session directory must be new; existing directories are never reused.") from None
    if os.name == "posix" and path.stat().st_mode & 0o077:
        raise MaskingError("Filesystem did not honor private directory permissions.")
    # A partial session cannot export without all three consistent files.
    write_new(path / SESSION_MAP, json.dumps(mapping, ensure_ascii=False, indent=2) + "\n", ack_unprotected_storage=ack_unprotected_storage)
    write_new(path / PREVIEW, result.masked, ack_unprotected_storage=ack_unprotected_storage)
    write_new(path / REPORT, json.dumps(result.review_report(), ensure_ascii=False, indent=2) + "\n", ack_unprotected_storage=ack_unprotected_storage)


def load_session(path: Path, *, ack_unprotected_storage: bool = False) -> tuple[dict, str]:
    require_platform(ack_unprotected_storage)
    if path.is_symlink() or not path.is_dir():
        raise MaskingError("Invalid session directory.")
    if os.name == "posix" and path.stat().st_mode & 0o077:
        raise MaskingError("Session directory must not be accessible to group or other users.")
    data = loads(read_text(path / SESSION_MAP, private=True, ack_unprotected_storage=ack_unprotected_storage))
    preview = read_text(path / PREVIEW, private=True, ack_unprotected_storage=ack_unprotected_storage)
    report = loads(read_text(path / REPORT, private=True, ack_unprotected_storage=ack_unprotected_storage))
    if not isinstance(data, dict) or set(data) != {"version", "source_sha256", "preview_sha256", "mode", "mapping"} or type(data["version"]) is not int or data["version"] != 1:
        raise MaskingError("Invalid session map format.")
    validate_mapping(data["mapping"])
    if not isinstance(data["source_sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", data["source_sha256"]):
        raise MaskingError("Invalid source digest.")
    if not isinstance(report, dict) or report.get("candidate_sha256") != source_digest(preview) or data["preview_sha256"] != source_digest(preview) or report.get("source_sha256") != data["source_sha256"]:
        raise MaskingError("Session files are inconsistent; review a newly prepared session.")
    # Hash consistency detects accidental edits, NOT an attacker able to rewrite the map.
    if report.get("review_required") is not True or report.get("complete_anonymization") is not False:
        raise MaskingError("Invalid review metadata.")
    if source_digest(restore(preview, data["mapping"])) != data["source_sha256"]:
        raise MaskingError("Map originals do not reconstruct the source; review a newly prepared session.")
    return data, preview
