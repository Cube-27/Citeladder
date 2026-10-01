"""Generic vocabulary for company-profile pages and provider identity."""

from __future__ import annotations

from typing import Final

COMPANY_PROFILE_ROUTE_SEGMENTS: Final[tuple[str, ...]] = (
    "about",
    "about-us",
    "our-company",
    "our-story",
    "who-we-are",
)
COMPANY_PROFILE_TITLE_PHRASES: Final[tuple[str, ...]] = (
    "about",
    "about us",
    "our company",
    "our story",
    "who we are",
    "story of",
)
COMPANY_PROFILE_EXCLUDED_TERMS: Final[tuple[str, ...]] = (
    "careers",
    "company history",
    "contact",
    "history",
    "leadership",
    "our team",
    "ownership",
    "responsibility",
    "sourcing",
    "sustainability",
    "team",
)

# Generic page-language subjects that fit the provider sentence grammar but do
# not identify a legal or product entity (for example, "Our team provides …").
PROVIDER_IDENTITY_EXCLUSIONS: Final[frozenset[str]] = frozenset(
    {
        "our company",
        "our platform",
        "our product",
        "our products",
        "our service",
        "our services",
        "our solution",
        "our solutions",
        "our team",
        "the team",
    }
)
