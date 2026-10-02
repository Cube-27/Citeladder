"""Export frozen identity vocabulary from its existing policy owners."""

from typing import Any

from app.core.config import brand_profile as brand_profile_config
from app.core.config import observed_competitors as observed_config
from app.core.config.projects import MAX_PROJECT_COMPETITORS


def brand_identity_policy() -> dict[str, Any]:
    """Bounds and tokens for brand-profile, business-map and suggestion writes."""
    profile = brand_profile_config
    return {
        "profile_fields": list(profile.BRAND_PROFILE_FIELDS),
        "profile_text_max_chars": profile.BRAND_PROFILE_TEXT_MAX_CHARS,
        "profile_product_max_chars": profile.BRAND_PROFILE_PRODUCT_MAX_CHARS,
        "profile_products_max_count": profile.BRAND_PROFILE_PRODUCTS_MAX_COUNT,
        "profile_source_manual": profile.BRAND_PROFILE_SOURCE_MANUAL,
        "profile_review_confirmed": profile.BRAND_PROFILE_REVIEW_CONFIRMED,
        "profile_review_edited": profile.BRAND_PROFILE_REVIEW_EDITED,
        "map_value_max_chars": profile.BUSINESS_MAP_VALUE_MAX_CHARS,
        "map_max_entries_per_dimension": (
            profile.BUSINESS_MAP_MAX_ENTRIES_PER_DIMENSION
        ),
        "map_max_exclusions": profile.BUSINESS_MAP_MAX_EXCLUSIONS,
        "max_project_competitors": MAX_PROJECT_COMPETITORS,
        "suggestion_pending": observed_config.STATUS_PENDING,
        "suggestion_accepted": observed_config.STATUS_ACCEPTED,
    }
