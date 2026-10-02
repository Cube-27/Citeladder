"""Shared Python model/operator defaults; runtime policy is native."""

from __future__ import annotations

from typing import Final

BRAND_PROFILE_FIELD_DESCRIPTION: Final = "description"

BRAND_PROFILE_FIELD_POSITIONING: Final = "positioning"

BRAND_PROFILE_FIELD_PRODUCTS_SERVICES: Final = "products_services"

BRAND_PROFILE_FIELD_TARGET_AUDIENCE: Final = "target_audience"

BRAND_PROFILE_FIELDS: Final[tuple[str, ...]] = (
    BRAND_PROFILE_FIELD_DESCRIPTION,
    BRAND_PROFILE_FIELD_POSITIONING,
    BRAND_PROFILE_FIELD_PRODUCTS_SERVICES,
    BRAND_PROFILE_FIELD_TARGET_AUDIENCE,
)

BRAND_PROFILE_SOURCE_MANUAL: Final = "manual"

BRAND_PROFILE_REVIEW_CONFIRMED: Final = "confirmed"
