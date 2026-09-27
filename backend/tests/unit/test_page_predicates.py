"""Heading predicates shared by the placement detector and verifier."""

from __future__ import annotations

from app.analysis.opportunities.page_predicates import listed_in_headings


def test_a_name_is_listed_by_one_heading_with_alias_rules() -> None:
    assert listed_in_headings("Best & Less", ("Top picks", "Best and Less")) is True


def test_a_name_never_spans_two_adjacent_headings() -> None:
    assert listed_in_headings("Acme", ("Ac", "me")) is False
