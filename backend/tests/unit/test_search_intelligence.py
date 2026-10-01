from decimal import Decimal

import pytest

from app.core.config.search_intelligence import estimate_dataset, page_sizes
from app.domain.demand.search_intelligence.pagination import (
    UnsupportedSortError,
    sorted_rows,
)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("sort", "direction"), [("unsupported", "asc"), ("keyword", "sideways")]
)
async def test_invalid_ordering_is_distinct_from_invalid_cursor(sort, direction):
    with pytest.raises(UnsupportedSortError):
        await sorted_rows(
            None, None, cursor="invalid", limit=10, sort=sort, direction=direction
        )


def test_quote_uses_ceil_pages_and_exact_decimal_rates() -> None:
    assert page_sizes(1001) == (1000, 1)
    assert estimate_dataset("ranking_keywords", rows=1001).estimated_usd == Decimal(
        "0.14412"
    )
    assert estimate_dataset("referring_domains", rows=1001).estimated_usd == Decimal(
        "0.084036"
    )
