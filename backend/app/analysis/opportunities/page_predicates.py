"""Checkable facts about one inspected third-party page (pure).

Shared by the detector that RAISES a discrepancy and the verifier that later
SETTLES it. That sharing is the whole point: a correction task asserts
something specific about a page, and the check that confirms it has to ask the
page the same question in the same words. Two copies of these predicates drift
the day one of them gains a normalisation step, and a correction somebody
actually made then verifies as unmet forever with nothing to point at.

What each caller does with an EMPTY input differs and stays with the caller.
A page from which no links were extracted is a limitation of the reading for
the verifier (nothing can be confirmed) and simply not a discrepancy for the
detector (nothing can be asserted). That policy is not a property of the
matching, so it is not in here.
"""

from __future__ import annotations

from app.analysis.normalization import alias_present, domain_matches, normalize_alias

__all__ = ["links_to_owned", "listed_in_headings"]


def listed_in_headings(name: str, headings: tuple[str, ...]) -> bool:
    """Whether a tracked name appears as an entry heading on this page.

    Matched with the same alias rules the page's presence verdicts were
    produced under. Plain substring containment would match inside a longer
    word and would miss ``Best & Less`` against ``Best and Less``, so the
    heading check and the presence check could disagree about the same brand
    on the same page.
    """
    joined = normalize_alias(" | ".join(headings))
    alias = normalize_alias(name)
    return bool(joined and alias and alias_present(alias, joined))


def links_to_owned(
    outbound_domains: tuple[str, ...], owned_domains: tuple[str, ...]
) -> bool:
    """Whether the page links out to any of the brand's reviewed domains.

    Compared with the same rule that classifies a citation as owned, so this
    cannot disagree with ``Citation.is_owned`` about the same pair -- a link
    to ``docs.brand.com`` is a link to us, and ``www.`` is not a distinction.
    """
    return any(
        domain_matches(linked, owned)
        for linked in outbound_domains
        for owned in owned_domains
    )
