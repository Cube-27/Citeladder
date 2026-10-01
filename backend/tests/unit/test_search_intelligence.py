from decimal import Decimal

from app.core.config.search_intelligence import estimate_dataset, page_sizes


def test_quote_uses_ceil_pages_and_exact_decimal_rates() -> None:
    assert page_sizes(1001) == (1000, 1)
    assert estimate_dataset("ranking_keywords", rows=1001).estimated_usd == Decimal(
        "0.14412"
    )
    assert estimate_dataset("referring_domains", rows=1001).estimated_usd == Decimal(
        "0.084036"
    )
