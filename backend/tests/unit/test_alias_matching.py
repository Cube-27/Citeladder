"""Alias matching across separator-free and spaced spellings of one brand.

The production incident these cover: a project whose brand name was entered as
the domain label ``bestandless`` scored 0% visibility while its competitors
scored normally, because the models answer "Best & Less" -- three tokens after
normalization, containing none of the one-token spelling and contained by
neither.
"""

from __future__ import annotations

import pytest

from app.analysis.normalization import (
    alias_present,
    first_alias_offset,
    normalize_alias,
)


def present(alias: str, text: str) -> bool:
    return alias_present(normalize_alias(alias), normalize_alias(text))


@pytest.mark.parametrize(
    "alias,text",
    [
        # The joined spelling is the alias, the split one is in the answer.
        ("bestandless", "I recommend Best&Less for cheap kids basics"),
        ("bestandless", "Try Best & Less or Kmart"),
        ("bestandless", "Best and Less runs regular sales"),
        # ... and the same pair the other way round.
        ("Best & Less", "bestandless is the cheapest of these"),
        ("Best&Less", "bestandless.com.au lists them at $8"),
        ("Best and Less", "Shop bestandless for school uniforms"),
        # Neither spelling is special: a split single word matches too.
        ("kmart", "K Mart stocks the same range"),
        ("bigw", "Big W has it on clearance"),
        ("big w", "BigW has it on clearance"),
    ],
)
def test_joined_and_split_spellings_are_one_brand(alias: str, text: str) -> None:
    assert present(alias, text)


@pytest.mark.parametrize(
    "alias,text",
    [
        # Compact matching must not reintroduce mid-word hits: the run would
        # have to end where no token ends.
        ("bonds", "a bond sand gravel supplier"),
        ("target", "targeted advertising campaigns"),
        # Non-adjacent tokens: "option" breaks the run.
        ("bestandless", "the best option and less expensive than most"),
        ("kmart", "the kmarts of this world"),
        # An absent brand stays absent.
        ("bestandless", "Kmart, Target and Big W all stock it"),
    ],
)
def test_partial_and_absent_spellings_do_not_match(alias: str, text: str) -> None:
    assert not present(alias, text)


def test_offset_is_the_first_appearance_in_the_normalized_answer() -> None:
    """Position ordering reads this offset, so it must index the answer."""
    text = normalize_alias("Kmart and Best & Less both stock it")
    offset = first_alias_offset(normalize_alias("bestandless"), text)
    assert offset is not None
    assert text[offset:].startswith("best and less")


def test_offset_prefers_the_earlier_of_the_two_spellings() -> None:
    """One answer can carry both spellings; the first one is the position."""
    text = normalize_alias("bestandless beats Best & Less on price")
    assert first_alias_offset(normalize_alias("bestandless"), text) == 0


def test_empty_alias_is_never_present() -> None:
    assert not alias_present("", "best and less")
    assert first_alias_offset("   ", "best and less") is None


def test_seeded_brand_aliases_add_the_domain_label() -> None:
    """A project's brand arrives with aliases now, as its competitors always did."""
    from app.domain.projects.onboarding.service import _seed_brand_aliases

    assert _seed_brand_aliases("Best & Less", ["bestandless.com.au"]) == ["bestandless"]


def test_seeded_brand_aliases_skip_a_label_that_is_the_name() -> None:
    """The name is prepended onto the alias list by the scorer already."""
    from app.domain.projects.onboarding.service import _seed_brand_aliases

    assert _seed_brand_aliases("bestandless", ["BestAndLess.com.au"]) == []


def test_seeded_brand_aliases_dedupe_across_domains() -> None:
    from app.domain.projects.onboarding.service import _seed_brand_aliases

    aliases = _seed_brand_aliases(
        "Hiut Denim", ["hiutdenim.co.uk", "hiutdenim.com", "hiut.shop"]
    )
    assert aliases == ["hiutdenim", "hiut"]


def test_a_rejected_run_does_not_hide_a_valid_one_after_it() -> None:
    """Overlapping candidates each get judged, rather than the first winning.

    Scanning for candidates yields non-overlapping matches, so rejecting the
    run at offset 0 skipped the real mention that overlapped it.
    """
    assert present("Duran Duran", "Duran DuranDuran tribute")
    assert alias_present("aba", "ab ab a")


def test_offset_is_the_earliest_valid_run_not_the_first_candidate() -> None:
    text = normalize_alias("Duran DuranDuran and Duran Duran")
    assert first_alias_offset(normalize_alias("Duran Duran"), text) == 6


def test_a_joined_alias_can_match_the_same_words_used_as_prose() -> None:
    """A known limitation, pinned so it is a decision and not a surprise.

    Normalization turns punctuation into spaces, so a joined-spelling alias
    matches its own words wherever they run together -- including across a
    sentence boundary. This is the same exposure a spaced alias always had
    ("Best & Less" normalizes to exactly these tokens); the joined spelling
    simply no longer escapes it. Brands whose name is an ordinary phrase are
    inherently ambiguous in free text, and the alias list is editable.
    """
    assert present("bestandless", "you want the best and less hassle")
    assert present("bestandless", "Pick the best. And less obvious: Kmart.")
