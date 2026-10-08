"""Deterministic replacement/restoration; maps stay in memory unless explicitly saved."""

from __future__ import annotations

from dataclasses import dataclass
from bisect import bisect_right
import hashlib
import re
import secrets
from typing import Iterable

MAX_SOURCE_BYTES = 1_048_576
MARKER = "[[CMASK"
TOKEN_RE = re.compile(r"\[\[CMASK:[0-9a-f]{32}:[0-9a-f]{16}\]\]")
RESERVED_RE = re.compile(r"\[\[\s*CMASK|CMASK\s*:", re.IGNORECASE)


class MaskingError(ValueError):
    """Messages must be static and must never include source or server responses."""


@dataclass(frozen=True)
class Span:
    start: int
    end: int
    category: str = "sensitive"
    detector: str = "manual"


@dataclass(frozen=True)
class MaskingResult:
    masked: str
    mapping: dict[str, str]
    spans: tuple[Span, ...]
    source_sha256: str
    mode: str

    def restore(self, response: str) -> str:
        return restore(response, self.mapping)

    def review_report(self) -> dict:
        """No originals/snippets; this is metadata, not a safety certificate."""
        return {
            "mode": self.mode,
            "review_required": True,
            "complete_anonymization": False,
            "source_sha256": self.source_sha256,
            "candidate_sha256": source_digest(self.masked),
            "span_count": len(self.spans),
            "unique_value_count": len(self.mapping),
            "ambiguous_identifier_count": sum(s.category == "identifier" for s in self.spans),
            "model_completeness_unverified": "djev" in self.mode,
            "spans": [
                {"start": s.start, "end": s.end, "category": s.category, "detector": s.detector}
                for s in self.spans
            ],
        }


def check_source(text: str) -> None:
    if not isinstance(text, str):
        raise MaskingError("Expected UTF-8 text.")
    try:
        size = len(text.encode("utf-8"))
    except UnicodeEncodeError:
        raise MaskingError("Invalid Unicode text.") from None
    if size > MAX_SOURCE_BYTES:
        raise MaskingError("Input exceeds the byte limit; nothing was truncated.")
    if RESERVED_RE.search(text):
        raise MaskingError("Input contains a reserved mask marker; review it separately.")


def source_digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def validate_span(text: str, span: Span) -> Span:
    if not isinstance(span, Span):
        raise MaskingError("Invalid span record.")
    if type(span.start) is not int or type(span.end) is not int:
        raise MaskingError("Offsets must be integer Unicode code-point positions.")
    if not 0 <= span.start < span.end <= len(text):
        raise MaskingError("Span is empty or outside the source.")
    if not isinstance(span.category, str) or not re.fullmatch(r"[a-z][a-z0-9_-]{0,39}", span.category):
        raise MaskingError("Invalid span category.")
    if not isinstance(span.detector, str) or not re.fullmatch(r"[a-z][a-z0-9_-]{0,39}", span.detector):
        raise MaskingError("Invalid detector name.")
    return span


def merge_spans(text: str, spans: Iterable[Span]) -> tuple[Span, ...]:
    ordered = sorted((validate_span(text, s) for s in spans), key=lambda s: (s.start, s.end))
    merged: list[Span] = []
    for span in ordered:
        if merged and span.start < merged[-1].end:
            previous = merged[-1]
            if previous.category == span.category:
                category = previous.category
            elif (previous.start, previous.end) == (span.start, span.end):
                # Explicit field labels are more specific than a model's additional guess.
                priority = {"field-id": 3, "ambiguous-id": 2, "domain-format": 2, "regex": 1}
                category = max((previous, span), key=lambda s: priority.get(s.detector, 0)).category
            elif previous.start <= span.start and previous.end >= span.end:
                category = previous.category
            elif span.start <= previous.start and span.end >= previous.end:
                category = span.category
            else:
                category = "sensitive"
            merged[-1] = Span(previous.start, max(previous.end, span.end), category, "merged")
        else:
            merged.append(span)
    return tuple(merged)


def add_spans_preserving_core(text: str, core: tuple[Span, ...], additions: Iterable[Span]) -> tuple[Span, ...]:
    """Mask the whole union while retaining deterministic field-ID identity boundaries."""
    extra = merge_spans(text, additions)
    ends = [s.end for s in core]
    combined = list(core)
    for span in extra:
        cursor = span.start
        index = bisect_right(ends, cursor)
        while index < len(core) and core[index].start < span.end:
            anchor = core[index]
            if cursor < anchor.start:
                combined.append(Span(cursor, min(anchor.start, span.end), span.category, span.detector))
            cursor = max(cursor, anchor.end)
            index += 1
        if cursor < span.end:
            combined.append(Span(cursor, span.end, span.category, span.detector))
    return tuple(sorted(combined, key=lambda s: (s.start, s.end)))


# These are deliberately conservative candidates, not a Japanese NER model.
_PATTERNS: tuple[tuple[str, re.Pattern, str | int], ...] = (
    ("private_key", re.compile(r"-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----"), 0),
    ("email", re.compile(r"(?<![A-Za-z0-9.!#$%&'*+/=?^_`{|}~-])[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+"), 0),
    ("provider_token", re.compile(r"(?<![A-Za-z0-9_])(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Za-z0-9_])"), 0),
    ("provider_token", re.compile(r"(?<![A-Za-z0-9_])(?:gh[pousr]_[A-Za-z0-9]{30,255}|github_pat_[A-Za-z0-9_]{20,255}|sk-(?:proj-)?[A-Za-z0-9_-]{20,255}|xox[baprs]-[A-Za-z0-9-]{10,255})(?![A-Za-z0-9_])"), 0),
    ("bearer", re.compile(r"\bBearer\s+([A-Za-z0-9._~+/-]{8,}={0,2})", re.IGNORECASE), 1),
    ("jwt", re.compile(r"(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}(?![A-Za-z0-9_-])"), 0),
    ("url_credentials", re.compile(r"(?<![a-zA-Z0-9+.-])[a-zA-Z][a-zA-Z0-9+.-]*://([^\s/@:]+:[^\s/@]+)@"), 1),
    ("phone", re.compile(r"(?<![0-9])(?:0[789]0[- ー]?\d{4}[- ー]?\d{4}|0\d{1,4}[- ー]\d{1,4}[- ー]\d{3,4}|\+81[- ]?\d{1,4}[- ]?\d{2,4}[- ]?\d{3,4})(?![0-9])"), 0),
    ("postal_code", re.compile(r"(?<![0-9])(?:〒[ ]*)?\d{3}-\d{4}(?![0-9])"), 0),
)


def regex_spans(text: str) -> list[Span]:
    check_source(text)
    from .fields import labelled_spans

    spans: list[Span] = []
    for category, pattern, group in _PATTERNS:
        if category == "email" and "@" not in text:
            continue
        if category == "url_credentials" and "://" not in text:
            continue
        for match in pattern.finditer(text):
            start, end = match.span(group)
            spans.append(Span(start, end, category, "regex"))
    spans.extend(labelled_spans(text, r"password|passwd|pwd|api[_ -]?key|secret|token|access[_ -]?token|client[_ -]?secret|パスワード|APIキー|秘密鍵|トークン", "secret_assignment", "regex"))
    if len(re.findall(r"-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----", text)) != sum(s.category == "private_key" for s in spans):
        raise MaskingError("A private-key block is unfinished; no partial masking was produced.")
    return spans


def mask(text: str, extra_spans: Iterable[Span] = (), *, mode: str = "regex-only", rules: dict | None = None) -> MaskingResult:
    """LLM/manual additions never remove deterministic candidates."""
    check_source(text)
    if mode not in {"regex-only", "regex+manual", "regex+djev", "regex+djev+manual"}:
        raise MaskingError("Invalid detection mode.")
    from .identifiers import identifier_spans

    core_spans = merge_spans(text, [*regex_spans(text), *identifier_spans(text, rules)])
    spans = add_spans_preserving_core(text, core_spans, extra_spans)
    nonce = secrets.token_hex(16)
    mapping: dict[str, str] = {}
    tokens_by_value: dict[tuple[str, str], str] = {}
    chunks: list[str] = []
    cursor = 0
    for span in spans:
        value = text[span.start:span.end]
        identity = (span.category, value)
        token = tokens_by_value.get(identity)
        if token is None:
            for _ in range(128):
                token = f"[[CMASK:{nonce}:{secrets.token_hex(8)}]]"
                if token not in mapping and token not in text:
                    break
            else:
                raise MaskingError("Unable to allocate a collision-free mask token.")
            mapping[token] = value
            tokens_by_value[identity] = token
        chunks.extend((text[cursor:span.start], token))
        cursor = span.end
    chunks.append(text[cursor:])
    candidate = "".join(chunks)
    if len(candidate.encode("utf-8")) > MAX_SOURCE_BYTES * 8:
        raise MaskingError("Masked output exceeds the byte limit; nothing was truncated.")
    return MaskingResult(candidate, mapping, spans, source_digest(text), mode)


def validate_mapping(mapping: dict[str, str]) -> None:
    if not isinstance(mapping, dict) or len(mapping) > 100_000:
        raise MaskingError("Invalid mapping.")
    nonces: set[str] = set()
    total_bytes = 0
    for token, original in mapping.items():
        if not isinstance(token, str) or not TOKEN_RE.fullmatch(token):
            raise MaskingError("Invalid map token.")
        if not isinstance(original, str) or not original or RESERVED_RE.search(original):
            raise MaskingError("Invalid original value in map.")
        try:
            total_bytes += len(original.encode("utf-8"))
        except UnicodeEncodeError:
            raise MaskingError("Invalid Unicode in map.") from None
        nonces.add(token.split(":")[1])
    if len(nonces) > 1:
        raise MaskingError("Map mixes document sessions.")
    if total_bytes > MAX_SOURCE_BYTES:
        raise MaskingError("Original mapping values exceed the byte limit.")


def restore(text: str, mapping: dict[str, str]) -> str:
    """Exact known tokens only, in a single pass; never ask an LLM to regenerate data."""
    validate_mapping(mapping)
    if not isinstance(text, str):
        raise MaskingError("Expected text to restore.")
    try:
        input_bytes = len(text.encode("utf-8"))
    except UnicodeEncodeError:
        raise MaskingError("Invalid Unicode in restore input.") from None
    if input_bytes > MAX_SOURCE_BYTES * 8:
        raise MaskingError("Restore input exceeds the byte limit.")
    matches = list(TOKEN_RE.finditer(text))
    if any(m.group(0) not in mapping for m in matches):
        raise MaskingError("Response contains an unknown mask token; no restoration was written.")
    # Detect damaged/case-altered markers without guessing their originals.
    residue = TOKEN_RE.sub("", text)
    if RESERVED_RE.search(residue):
        raise MaskingError("Response contains a damaged mask token; no restoration was written.")
    output_bytes = input_bytes + sum(len(mapping[m.group(0)].encode("utf-8")) - len(m.group(0)) for m in matches)
    if output_bytes > MAX_SOURCE_BYTES * 8:
        raise MaskingError("Restored output would exceed the byte limit.")
    return TOKEN_RE.sub(lambda m: mapping[m.group(0)], text)
