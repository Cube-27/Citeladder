"""Text-shape checks on prompt text: tokenization and template detection."""

from __future__ import annotations

import re
import unicodedata


def words(text: str) -> list[str]:
    """Case-folded word tokens, in any script.

    Splits on punctuation, symbols and separators and keeps letters, digits and
    combining marks. A regex word class is not enough: ``[^\\W_]+`` drops the
    vowel signs that Devanagari, Thai and Arabic words are built from, so a
    Hindi prompt tokenized into meaningless fragments and every check below
    quietly stopped working in exactly the markets this product sells into.
    """
    cleaned = "".join(
        " " if unicodedata.category(char)[0] in "PSZC" else char
        for char in text.casefold()
    )
    return cleaned.split()


# A bracketed span is a template slot the model never filled in: "Where to book
# a test ride for connected e-bikes in [city]". Real buyer queries do not carry
# square brackets, braces or angle brackets at all, so their presence is the
# signal -- no vocabulary of placeholder words to keep current, and no way for a
# non-English portfolio to slip past an English "[city]"/"[location]" list.
#
# Non-overlapping: the interior class excludes every bracket character, so the
# closing bracket can only match after it. That keeps the scan linear without
# letting a long unresolved slot bypass validation.
_PLACEHOLDER_SPAN = re.compile(r"[\[{<][^\[\]{}<>]*[\]}>]")


def contains_placeholder(text: str) -> bool:
    """Return whether text still carries an unfilled template slot."""
    return _PLACEHOLDER_SPAN.search(text) is not None
