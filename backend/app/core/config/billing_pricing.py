"""Catalog-authoring currency policy (invariant 1: config owns the rule).

Regional prices are FIXED catalog terms. India is charged in INR and every
other billing country in USD. The INR amount is derived exactly once, when a
catalog revision is authored, and is frozen in that revision's payload. Runtime
code only reads the stored integers: no quote, checkout or renewal ever
converts a currency, so a recurring mandate is never repriced by FX.

Changing the rate means authoring and publishing a new revision; existing
subscribers keep the terms frozen with their subscription.
"""

from __future__ import annotations

from decimal import ROUND_CEILING, Decimal
from typing import Final

# Default authoring rate (INR per USD). The seed command accepts an explicit
# override, and the rate actually used is recorded on every regional price.
AUTHORING_USD_INR_RATE: Final = Decimal("90")

# Rupees per rounding step. Prices round UP to the next ₹100 and end in 99.
_INR_STEP_MAJOR: Final = 100
_PAISE_PER_RUPEE: Final = 100


def inr_minor_from_usd_minor(usd_minor: int, rate: Decimal) -> int:
    """GST-exclusive INR paise for a USD price, by the published catalog rule.

    ``INR = ceil(USD × rate / 100) × 100 − 1`` in whole rupees, so $49 at ₹90
    becomes ₹4,499 and $19 becomes ₹1,799.
    """
    if usd_minor <= 0:
        raise ValueError("usd_minor must be positive")
    if rate <= 0:
        raise ValueError("authoring rate must be positive")
    rupees = Decimal(usd_minor) * rate / _PAISE_PER_RUPEE
    steps = (rupees / _INR_STEP_MAJOR).to_integral_value(rounding=ROUND_CEILING)
    return (int(steps) * _INR_STEP_MAJOR - 1) * _PAISE_PER_RUPEE


__all__ = ["AUTHORING_USD_INR_RATE", "inr_minor_from_usd_minor"]
