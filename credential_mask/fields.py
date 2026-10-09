"""Source-position parsing of labelled values, including escaped quoted JSON strings."""

import re

from .core import MaskingError, Span


def value_bounds(text: str, start: int) -> tuple[int, int] | None:
    if start >= len(text):
        return None
    quote = text[start] if text[start] in {"\"", "'"} else None
    if quote:
        cursor = start + 1
        while cursor < len(text):
            char = text[cursor]
            if char in "\r\n":
                raise MaskingError("A recognized field has an unfinished quoted value; no partial masking was produced.")
            if char == "\\":
                if cursor + 1 >= len(text) or text[cursor + 1] in "\r\n":
                    raise MaskingError("A recognized field has an unfinished escape; no partial masking was produced.")
                cursor += 2
                continue
            if char == quote:
                return (start + 1, cursor) if cursor > start + 1 else None
            cursor += 1
        raise MaskingError("A recognized field has an unfinished quoted value; no partial masking was produced.")
    cursor = start
    while cursor < len(text) and not text[cursor].isspace() and text[cursor] not in ",;]}、。":
        cursor += 1
    return (start, cursor) if cursor > start else None


def labelled_spans(text: str, label_expression: str, category: str, detector: str) -> list[Span]:
    head = re.compile(rf"(?<![A-Za-z0-9_])(?:{label_expression})[\"']?\s*[:=：]\s*", re.IGNORECASE)
    spans = []
    cursor = 0
    while match := head.search(text, cursor):
        bounds = value_bounds(text, match.end())
        quoted = match.end() < len(text) and text[match.end()] in {"\"", "'"}
        if bounds and (quoted or text[bounds[0]:bounds[1]].lower() not in {"null", "none", "true", "false"}):
            spans.append(Span(bounds[0], bounds[1], category, detector))
        # Never rescan assignment-like text inside an already parsed value.
        cursor = bounds[1] + int(quoted) if bounds else match.end() + int(quoted)
    return spans
