"""Strict JSON input; duplicate keys and non-finite numbers are rejected."""

import json

from .core import MaskingError


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise MaskingError("Duplicate JSON key.")
        result[key] = value
    return result


def _constant(_):
    raise MaskingError("Non-finite JSON number.")


def loads(value: str | bytes):
    try:
        return json.loads(value, object_pairs_hook=_pairs, parse_constant=_constant)
    except (ValueError, UnicodeError, RecursionError):
        raise MaskingError("Invalid JSON input.") from None
