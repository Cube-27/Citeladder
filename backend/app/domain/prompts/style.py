"""Unicode word tokenization for brand identity matching."""

from __future__ import annotations

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
