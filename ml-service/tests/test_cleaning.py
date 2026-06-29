"""Unit tests for the vendored, frozen cleaning contract.

These pin the exact behavior the DistilBERT export was contract-tested against.
If someone "improves" app/cleaning.py, these fail — which is the point: serving
preprocessing must not drift from training preprocessing.
"""

from app.cleaning import MIN_CHARS, clean_text, collapse_redactions, is_valid


def test_min_chars_is_ten():
    """The frozen floor is exactly 10; a change here is a contract break."""
    assert MIN_CHARS == 10


def test_collapse_redactions_canonicalizes_runs():
    assert collapse_redactions("XXXX") == "XXXX"
    assert collapse_redactions("XXXXXXXX") == "XXXX"
    # A lone X (run length 1) is NOT a redaction marker and is left alone.
    assert collapse_redactions("Xerox") == "Xerox"


def test_clean_text_collapses_whitespace_and_redactions():
    raw = "I disputed XXXXXXXX with XXXX on   my report.\n\nNo response."
    cleaned = clean_text(raw)
    assert cleaned == "I disputed XXXX with XXXX on my report. No response."


def test_clean_text_strips_control_chars():
    # \x00 (null) and \x07 (bell) are control chars -> become spaces -> collapsed.
    assert clean_text("ab\x00\x07cd") == "ab cd"


def test_clean_text_non_string_returns_empty():
    # Intentionally passing non-str to exercise the isinstance guard; the type
    # errors are the point of the test, so they're suppressed for the checker.
    assert clean_text(None) == ""  # type: ignore[arg-type]
    assert clean_text(123) == ""  # type: ignore[arg-type]


def test_is_valid_boundary():
    # Exactly 10 chars -> valid; 9 -> invalid.
    assert is_valid("0123456789") is True
    assert is_valid("012345678") is False


def test_short_input_after_cleaning_is_invalid():
    # 'XX' collapses to 'XXXX' (4 chars) -> below MIN_CHARS.
    assert is_valid(clean_text("XX")) is False
