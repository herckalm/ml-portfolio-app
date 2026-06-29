"""Stage 2 — text cleaning.

VENDORED — FROZEN CONTRACT. Copied verbatim from the `ml-portfolio-models`
research repo, against which the DistilBERT export was contract-tested. Do NOT
"improve" this (no lowercasing, no extra normalization, no MIN_CHARS tweaks):
any change here silently diverges serving-time preprocessing from training-time
preprocessing and corrupts predictions. If the research-repo source changes,
re-vendor it deliberately and re-run the contract tests.

Deliberately conservative: BERT's tokenizer handles casing, punctuation, and
messy text, so we clean ONLY genuine noise — redaction-token runs, whitespace,
and control characters. No lowercasing, no punctuation/stopword removal.

Pure functions, no I/O.
"""

from __future__ import annotations

import re
import unicodedata

# Runs of 2+ uppercase X are CFPB PII redactions (XXXX, XXXXXXXX, etc.).
# We collapse any such run to a single canonical token so the model sees one
# consistent "redacted entity" marker instead of many length variants.
_XXXX_RUN = re.compile(r"X{2,}")
_REDACTION_TOKEN = "XXXX"

# Control characters (except common whitespace) -> strip.
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

# any run of whitespace (incl. newlines/tabs) -> single space.
_WHITESPACE = re.compile(r"\s+")

# Below this many characters after cleaning, a narrative is treated as junk.
MIN_CHARS = 10


def collapse_redactions(text: str) -> str:
    """Collapse runs of 2+ 'X' into a single canonical XXXX token."""
    return _XXXX_RUN.sub(_REDACTION_TOKEN, text)


def normalize_unicode(text: str) -> str:
    """NFKC-normalize so visually identical chars compare equal."""
    return unicodedata.normalize("NFKC", text)


def clean_text(text: str) -> str:
    """Apply the full minimal cleaning pipeline to one narrative.

    Steps: unicode-normalize -> strip control chars -> collapse XXXX runs
    -> collapse whitespace -> strip ends. Returns '' for non-strings.
    """
    if not isinstance(text, str):
        return ""
    text = normalize_unicode(text)
    text = _CONTROL_CHARS.sub(" ", text)
    text = collapse_redactions(text)
    text = _WHITESPACE.sub(" ", text)
    return text.strip()


def is_valid(text: str) -> bool:
    """True if the cleaned text is substantive enough to keep."""
    return len(text) >= MIN_CHARS
