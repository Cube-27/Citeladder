"""Pure assessment of one fetched third-party page.

No database, no network, no model call. Given bytes and a roster, produces the
page's format, what was found on it, and the passages proving it.
"""

from __future__ import annotations

from app.analysis.source_pages.contracts import (
    EntityPresence,
    EvidencePassage,
    ExtractedPage,
    PageAssessment,
)
from app.analysis.source_pages.extract import extract_source_page
from app.analysis.source_pages.page_format import derive_page_format
from app.analysis.source_pages.presence import assess_entity, has_sufficient_coverage
from app.core.config.source_pages import ENTITY_KIND_BRAND, ENTITY_KIND_COMPETITOR

__all__ = [
    "EntityPresence",
    "EvidencePassage",
    "ExtractedPage",
    "PageAssessment",
    "assess_page",
    "derive_page_format",
    "extract_source_page",
    "has_sufficient_coverage",
]


def assess_page(
    page: ExtractedPage,
    *,
    brand_name: str,
    brand_aliases: tuple[str, ...] = (),
    competitors: tuple[tuple[str, tuple[str, ...]], ...] = (),
) -> PageAssessment:
    """Assess one extracted page against this project's roster.

    The brand is assessed first so its evidence is never crowded out of the
    bounded passage list by a page that names many competitors -- the brand's
    own presence is the finding the whole workflow turns on.
    """
    passages: list[EvidencePassage] = []
    presences: list[EntityPresence] = []
    if brand_name:
        presences.append(
            assess_entity(
                page,
                entity_kind=ENTITY_KIND_BRAND,
                entity_name=brand_name,
                aliases=brand_aliases,
                passages=passages,
            )
        )
    for name, aliases in competitors:
        if not name:
            continue
        presences.append(
            assess_entity(
                page,
                entity_kind=ENTITY_KIND_COMPETITOR,
                entity_name=name,
                aliases=aliases,
                passages=passages,
            )
        )
    page_format, method = derive_page_format(page)
    return PageAssessment(
        page_format=page_format,
        page_format_method=method,
        presences=tuple(presences),
        passages=tuple(passages),
        sufficient_coverage=has_sufficient_coverage(page),
    )
