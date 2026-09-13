from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config.billing_settings import BillingSettings


def test_seller_email_configuration_is_normalized() -> None:
    settings = BillingSettings(seller_email=" billing@example.test ")

    assert settings.seller_email == "billing@example.test"


@pytest.mark.parametrize(
    "seller_email",
    [
        "billing@example",
        "billing@example..test",
        "billing@example.test.",
        "billing @example.test",
        "billing@example.test@other.test",
    ],
)
def test_seller_email_configuration_rejects_invalid_addresses(
    seller_email: str,
) -> None:
    with pytest.raises(ValidationError, match="seller_email must be an email address"):
        BillingSettings(seller_email=seller_email)


@pytest.mark.parametrize(
    "seller_email",
    [
        "billing.team@example.test",
        "billing+india@accounts.example.test",
    ],
)
def test_seller_email_configuration_accepts_supported_address_shapes(
    seller_email: str,
) -> None:
    assert BillingSettings(seller_email=seller_email).seller_email == seller_email
