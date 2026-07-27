"""Unit tests for the product-catalog CSV parser.

Covers header aliases + column reordering, BOM stripping, blank-row skip,
attribute-column folding, and the deliberate deviation from prompts:
headerless files are REJECTED (sku/name mapping would be ambiguous).
"""

from __future__ import annotations

import pytest

from app.core.config.http import IMPORT_MAX_CELL_CHARS, IMPORT_MAX_COLUMNS
from app.core.config.products import PRODUCT_IMPORT_MAX_ROWS
from app.domain.products.csv_import import ProductCsvError, parse_product_csv


def test_parse_headered_csv() -> None:
    csv_text = (
        "sku,name,price,currency,url\n"
        "VC-EB500-GR,VoltCity Commuter 500,2499.00,usd,https://acme.com/p/vc500\n"
        "TP-MTB29-PRO,TrailPeak MTB Pro 29,3899,AUD,\n"
    )
    rows = parse_product_csv(csv_text)
    assert len(rows) == 2
    assert rows[0].sku == "VC-EB500-GR"
    assert rows[0].name == "VoltCity Commuter 500"
    assert rows[0].price == 2499.00
    assert rows[0].currency == "USD"  # normalized to ISO uppercase
    assert rows[0].url == "https://acme.com/p/vc500"
    assert rows[1].price == 3899.00
    assert rows[1].url == ""


def test_parse_header_aliases_and_reordered_columns() -> None:
    csv_text = (
        "Product Title,Link,Amount,Currency Code,Product SKU\n"
        "SolarFold Panel 200W,https://acme.com/p/sf200,499.00,USD,SF-200W\n"
    )
    rows = parse_product_csv(csv_text)
    assert len(rows) == 1
    assert rows[0].sku == "SF-200W"
    assert rows[0].name == "SolarFold Panel 200W"
    assert rows[0].price == 499.00
    assert rows[0].currency == "USD"
    assert rows[0].url == "https://acme.com/p/sf200"


def test_parse_attribute_columns_fold_into_attributes() -> None:
    csv_text = (
        "name,sku,variant,category,gtin,brand,availability\n"
        "VoltCity 500,VC-500,Graphite / Standard,E-Bikes,"
        "0123456789012,Voltaic,In stock\n"
    )
    rows = parse_product_csv(csv_text)
    assert len(rows) == 1
    assert rows[0].attributes == {
        "brand": "Voltaic",
        "category": "E-Bikes",
        "gtin": "0123456789012",
        "availability": "In stock",
    }
    assert rows[0].variants[0].name == "Graphite / Standard"


def test_parse_aliases_and_price_tolerances() -> None:
    csv_text = (
        "sku,name,aliases,price\n"
        'VC-500,VoltCity 500,"VoltCity|VC500|Commuter 500","$2,499.00"\n'
    )
    rows = parse_product_csv(csv_text)
    assert rows[0].aliases == ["VoltCity", "VC500", "Commuter 500"]
    assert rows[0].price == 2499.00


def test_parse_skips_blank_rows_bom_and_missing_sku() -> None:
    csv_text = "\ufeffsku,name\n\n   \n,No SKU row\nVC-500,\n"
    rows = parse_product_csv(csv_text)
    # Blank rows skipped; the sku-less row is skipped (sku is the identity);
    # a missing name falls back to the sku.
    assert len(rows) == 1
    assert rows[0].sku == "VC-500"
    assert rows[0].name == "VC-500"


def test_parse_headerless_rejected() -> None:
    with pytest.raises(ProductCsvError):
        parse_product_csv("VC-500,VoltCity 500,2499.00\n")


def test_parse_rejects_header_missing_either_required_column() -> None:
    # Both 'sku' and 'name' are required. A sku-less file would otherwise skip
    # every row (sku is the import identity) and silently import nothing.
    with pytest.raises(ProductCsvError):
        parse_product_csv("name,price\nVoltCity 500,2499.00\n")
    with pytest.raises(ProductCsvError):
        parse_product_csv("sku,price\nVC-500,2499.00\n")


def test_parse_empty_returns_empty() -> None:
    assert parse_product_csv("") == []
    assert parse_product_csv("   \n  ") == []


def test_product_csv_rejects_excess_rows_columns_and_cell_length() -> None:
    with pytest.raises(ProductCsvError, match="too many rows"):
        parse_product_csv(
            "sku,name\n"
            + "\n".join(
                f"sku-{index},Product" for index in range(PRODUCT_IMPORT_MAX_ROWS + 1)
            )
        )
    with pytest.raises(ProductCsvError, match="too many columns"):
        parse_product_csv(",".join("x" for _ in range(IMPORT_MAX_COLUMNS + 1)))
    with pytest.raises(ProductCsvError, match="cell is too long"):
        parse_product_csv("sku,name\n1," + "x" * (IMPORT_MAX_CELL_CHARS + 1))
