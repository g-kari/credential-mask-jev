"""Local files only; candidate export requires an explicit human review assertion."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

from .core import MaskingError, Span, mask, restore, source_digest, validate_span
from .djev import detect
from .jsonio import loads
from .storage import load_session, read_text, save_session, write_new


def manual_spans(text: str, value: dict) -> list[Span]:
    if not isinstance(value, dict) or set(value) != {"source_sha256", "spans"} or value.get("source_sha256") != source_digest(text):
        raise MaskingError("Manual spans are not bound to this exact source.")
    if not isinstance(value["spans"], list) or len(value["spans"]) > 100_000:
        raise MaskingError("Invalid manual spans list.")
    spans = []
    for item in value["spans"]:
        if not isinstance(item, dict) or set(item) != {"start", "end", "category"}:
            raise MaskingError("Invalid manual span record.")
        spans.append(validate_span(text, Span(item["start"], item["end"], item["category"], "manual")))
    return spans


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="Local reversible candidate masking. Human review is required; detection can miss information.")
    sub = root.add_subparsers(dest="command", required=True)
    prepare = sub.add_parser("prepare", help="create a private local candidate and ORIGINAL-SECRETS map (explicit plaintext opt-in)")
    prepare.add_argument("--input", required=True, type=Path)
    prepare.add_argument("--session", required=True, type=Path)
    prepare.add_argument("--allow-plaintext-map", action="store_true", help="acknowledge that the map stores originals unencrypted; do not upload it")
    prepare.add_argument("--rules", type=Path, help="safe domain key/prefix rules JSON")
    prepare.add_argument("--manual-spans", type=Path, help="source-bound Unicode code-point ranges JSON")
    prepare.add_argument("--djev-url", help="explicit literal loopback HTTP origin; no DNS/proxy/redirect/cloud fallback")
    prepare.add_argument("--model", help="already-served local model name; no download or discovery")
    prepare.add_argument("--ack-local-server", action="store_true", help="acknowledge the server receives originals; verify no remote upstream/logging yourself")
    export = sub.add_parser("export", help="copy a reviewed candidate to a new file; this never calls cloud AI")
    export.add_argument("--session", required=True, type=Path)
    export.add_argument("--output", required=True, type=Path)
    export.add_argument("--approve-reviewed", action="store_true", help="assert you reviewed candidate.txt against the original for missed sensitive data")
    undo = sub.add_parser("restore", help="restore exact known tokens into a new LOCAL sensitive file")
    undo.add_argument("--session", required=True, type=Path)
    undo.add_argument("--input", required=True, type=Path)
    undo.add_argument("--output", required=True, type=Path)
    for command in (prepare, export, undo):
        command.add_argument("--ack-unprotected-storage", action="store_true", help="on non-POSIX platforms acknowledge that 0600/0700 are NOT an ACL guarantee; use a secured local path")
    return root


def run(args) -> str:
    ack = args.ack_unprotected_storage
    if args.command == "prepare":
        if not args.allow_plaintext_map:
            raise MaskingError("Use memory-only API, or explicitly opt in to the ORIGINAL-SECRETS plaintext map.")
        text = read_text(args.input)
        extras = []
        parts = ["regex"]
        rules = loads(read_text(args.rules)) if args.rules else None
        if bool(args.djev_url) != bool(args.model):
            raise MaskingError("Specify both --djev-url and --model, or neither.")
        if args.djev_url:
            extras.extend(detect(text, base_url=args.djev_url, model=args.model, acknowledge_local_server=args.ack_local_server))
            parts.append("djev")
        if args.manual_spans:
            extras.extend(manual_spans(text, loads(read_text(args.manual_spans))))
            parts.append("manual")
        mode = "+".join(parts) if len(parts) > 1 else "regex-only"
        result = mask(text, extras, mode=mode, rules=rules)
        save_session(args.session, result, allow_plaintext_map=True, ack_unprotected_storage=ack)
        return f"Candidate prepared locally: {len(result.spans)} spans; mode={mode}. Review is required. The session map contains ORIGINAL SECRETS in plaintext."
    data, preview = load_session(args.session, ack_unprotected_storage=ack)
    if args.command == "export":
        if not args.approve_reviewed:
            raise MaskingError("Export blocked: review candidate.txt against the original, then explicitly approve review.")
        # Validate map ownership/damaged tokens too, without writing restored originals.
        restore(preview, data["mapping"])
        write_new(args.output, preview, ack_unprotected_storage=ack)
        return "Reviewed candidate copied locally. Detection is incomplete; no cloud request was made."
    response = read_text(args.input)
    restored = restore(response, data["mapping"])
    write_new(args.output, restored, ack_unprotected_storage=ack)
    return "Known tokens restored locally. The output now contains original sensitive information."


def main(argv=None) -> int:
    args = parser().parse_args(argv)
    try:
        print(run(args))
        return 0
    except MaskingError as error:
        print(f"Blocked: {error}", file=sys.stderr)
        return 2
    except (OSError, UnicodeError, RecursionError):
        # Generic failures only: filenames, input, model errors, and tracebacks can contain secrets.
        print("Operation blocked. Check limits, review/consent flags, file protection, source-bound spans, and local model configuration. No source or server response was logged.", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("Operation interrupted. Check and remove any partial local session securely.", file=sys.stderr)
        return 130
