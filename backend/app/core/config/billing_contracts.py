"""Shared Python model/operator defaults; runtime policy is native."""

from __future__ import annotations

from typing import Final

CADENCE_MONTHLY: Final = "monthly"

SUBSCRIPTION_KIND_BASE: Final = "base"

PROVIDER_RAZORPAY: Final = "razorpay"

SUBSCRIPTION_PENDING: Final = "pending"

REGION_INDIA: Final = "india"

REGION_INTERNATIONAL: Final = "international"

INDIA_COUNTRY_CODE: Final = "IN"

PREVIEW_REGION: Final = REGION_INTERNATIONAL

CURRENCY_USD: Final = "USD"

CURRENCY_INR: Final = "INR"

CURRENCY_MINOR_UNITS: Final[dict[str, int]] = {CURRENCY_USD: 2, CURRENCY_INR: 2}

TAX_BEHAVIOR_EXCLUSIVE: Final = "exclusive"

TAX_BEHAVIOR_INCLUSIVE: Final = "inclusive"

TAX_BEHAVIORS: Final[frozenset[str]] = frozenset(
    {TAX_BEHAVIOR_EXCLUSIVE, TAX_BEHAVIOR_INCLUSIVE}
)

REASON_CHECKOUT_UNAVAILABLE: Final = "checkout_unavailable"

REASON_CONTACT_ONLY: Final = "contact_only"

REASON_TRIAL_UNAVAILABLE: Final = "trial_unavailable"

PLAN_TIER_1: Final = "tier_1"

PLAN_TIER_2: Final = "tier_2"

PLAN_TIER_3: Final = "tier_3"

PLAN_ENTERPRISE: Final = "enterprise"

PLAN_KEYS: Final[tuple[str, ...]] = (
    PLAN_TIER_1,
    PLAN_TIER_2,
    PLAN_TIER_3,
    PLAN_ENTERPRISE,
)

ADDON_EXTRA_PROJECT: Final = "addon_extra_project"

ADDON_EXTRA_PROMPTS: Final = "addon_extra_prompts"

ADDON_EXTRA_SITE_HEALTH: Final = "addon_extra_site_health"

TOPUP_AUDIT_CREDITS: Final = "topup_audit_credits"

TOPUP_AI_CREDITS: Final = "topup_ai_credits"

ADDON_QUANTITY_MIN: Final = 1

ADDON_QUANTITY_MAX: Final = 20

TOPUP_QUANTITY_MIN: Final = 1

TOPUP_QUANTITY_MAX: Final = 20
