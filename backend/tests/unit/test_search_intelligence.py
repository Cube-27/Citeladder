from decimal import Decimal

import pytest

from app.core.config import settings
from app.core.config.dataforseo import pack_credential
from app.core.config.search_intelligence import estimate_dataset, page_sizes
from app.core.security import encrypt_secret
from app.domain.demand.search_intelligence.pagination import (
    UnsupportedSortError,
    sorted_rows,
)
from app.domain.providers.dataforseo_identity import dataforseo_account_identity


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("sort", "direction"), [("unsupported", "asc"), ("keyword", "sideways")]
)
async def test_invalid_ordering_is_distinct_from_invalid_cursor(sort, direction):
    with pytest.raises(UnsupportedSortError):
        await sorted_rows(
            None, None, cursor="invalid", limit=10, sort=sort, direction=direction
        )


def test_account_identity_survives_jwt_and_password_rotation(monkeypatch):
    def identity(login, password):
        return dataforseo_account_identity(
            encrypt_secret(pack_credential(login=login, password=password))
        )

    original = identity("Account@example.com", "old-password")
    monkeypatch.setattr(settings, "jwt_secret_key", "rotated-jwt-secret")
    assert identity(" account@EXAMPLE.com ", "new-password") == original
    assert identity("other@example.com", "new-password") != original


def test_quote_uses_ceil_pages_and_exact_decimal_rates() -> None:
    assert page_sizes(1001) == (1000, 1)
    assert estimate_dataset("ranking_keywords", rows=1001).estimated_usd == Decimal(
        "0.14412"
    )
    assert estimate_dataset("referring_domains", rows=1001).estimated_usd == Decimal(
        "0.084036"
    )
