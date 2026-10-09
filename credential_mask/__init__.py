"""No network calls, logging, or persistent mapping on import."""

from .core import MaskingError, MaskingResult, Span, mask, restore, source_digest

__all__ = ["MaskingError", "MaskingResult", "Span", "mask", "restore", "source_digest"]
