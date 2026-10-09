"""Context-bound IDs and safe configurable format rules (no arbitrary regex)."""

from __future__ import annotations

import re

from .core import MaskingError, Span
from .fields import labelled_spans

DEFAULT_KEYS = {
    "member_id": ["member_id", "membership_id", "member_no", "会員ID", "会員番号"],
    "customer_id": ["customer_id", "customer_no", "顧客ID", "顧客番号", "お客様番号"],
    "order_id": ["order_id", "order_no", "order_number", "注文ID", "注文番号", "受注番号"],
    # Explicit ambiguous fields are candidates, never assumed to be harmless indices.
    "identifier": ["id", "ID", "識別番号"],
}


def identifier_spans(text: str, config: dict | None = None) -> list[Span]:
    if config is not None and not isinstance(config, dict):
        raise MaskingError("Invalid domain rules.")
    config = config or {}
    if set(config) - {"keys", "formats"}:
        raise MaskingError("Unknown domain rule field.")
    keys = {category: list(names) for category, names in DEFAULT_KEYS.items()}
    custom_keys = config.get("keys", {})
    if not isinstance(custom_keys, dict) or len(custom_keys) > 32:
        raise MaskingError("Invalid domain key rules.")
    for category, names in custom_keys.items():
        if not isinstance(category, str) or not re.fullmatch(r"[a-z][a-z0-9_-]{0,39}", category):
            raise MaskingError("Invalid domain category.")
        if not isinstance(names, list) or not 1 <= len(names) <= 32:
            raise MaskingError("Invalid domain keys.")
        if any(not isinstance(n, str) or not 1 <= len(n) <= 64 for n in names):
            raise MaskingError("Invalid domain key.")
        keys.setdefault(category, []).extend(names)
    spans: list[Span] = []
    for category, names in keys.items():
        alternatives = "|".join(re.escape(n) for n in sorted(set(names), key=len, reverse=True))
        spans.extend(labelled_spans(text, alternatives, category, "ambiguous-id" if category == "identifier" else "field-id"))
    formats = config.get("formats", [])
    if not isinstance(formats, list) or len(formats) > 32:
        raise MaskingError("Invalid domain format rules.")
    for rule in formats:
        if not isinstance(rule, dict) or set(rule) != {"category", "prefix", "alphabet", "min_suffix", "max_suffix"}:
            raise MaskingError("Invalid domain format rule.")
        category, prefix, alphabet = rule["category"], rule["prefix"], rule["alphabet"]
        lo, hi = rule["min_suffix"], rule["max_suffix"]
        if not isinstance(category, str) or not re.fullmatch(r"[a-z][a-z0-9_-]{0,39}", category):
            raise MaskingError("Invalid domain category.")
        if not isinstance(prefix, str) or not 1 <= len(prefix) <= 32:
            raise MaskingError("Domain prefix must be non-empty.")
        if not isinstance(alphabet, str) or not 1 <= len(alphabet) <= 128 or any(c.isspace() for c in alphabet):
            raise MaskingError("Invalid domain alphabet.")
        if type(lo) is not int or type(hi) is not int or not 1 <= lo <= hi <= 128:
            raise MaskingError("Invalid domain suffix bounds.")
        pattern = re.compile(r"(?<![A-Za-z0-9_])" + re.escape(prefix) + f"[{re.escape(alphabet)}]{{{lo},{hi}}}" + rf"(?![{re.escape(alphabet)}])")
        spans.extend(Span(m.start(), m.end(), category, "domain-format") for m in pattern.finditer(text))
    return spans
