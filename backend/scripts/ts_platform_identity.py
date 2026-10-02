"""Shared offline-seeder brand-profile vocabulary."""

from typing import Any

from app.core.config import brand_profile


def brand_identity_policy() -> dict[str, Any]:
    return {
        "profile_fields": list(brand_profile.BRAND_PROFILE_FIELDS),
        "profile_source_manual": brand_profile.BRAND_PROFILE_SOURCE_MANUAL,
        "profile_review_confirmed": brand_profile.BRAND_PROFILE_REVIEW_CONFIRMED,
    }
