# CSV parsing for the product-catalog bulk-import.
#
# Mirrors ``domain/prompts/csv_import.py``: raw CSV text -> ``ProductInput``
# rows so the multipart-upload and JSON-rows import paths converge on the same
# create logic. DELIBERATE DEVIATION from prompts: headerless files are
# REJECTED — a product CSV without headers makes sku/name mapping ambiguous
# (``parse_prompt_csv`` accepts a headerless single column of texts).
from __future__ import annotations

import csv
import io
from typing import NamedTuple

from pydantic import ValidationError

from app.core.config.http import IMPORT_MAX_CELL_CHARS, IMPORT_MAX_COLUMNS
from app.core.config.products import PRODUCT_IMPORT_MAX_ROWS
from app.core.errors import sanitize_validation_errors
from app.domain.products.schemas import (
    ProductImportRowError,
    ProductInput,
    ProductVariant,
)

# Accepted header aliases -> canonical field. Case/space/underscore-insensitive.
_SKU_KEYS = {"sku", "sku_id", "product_sku", "product_id"}
_NAME_KEYS = {"name", "product", "product_name", "product_title", "title"}
_PRICE_KEYS = {"price", "price_amount", "amount"}
_CURRENCY_KEYS = {"currency", "currency_code", "price_currency"}
_URL_KEYS = {"url", "link", "product_url", "owned_url"}
_ALIASES_KEYS = {"aliases", "alias"}
_VARIANT_KEYS = {"variant", "variants"}
# Extra columns folded into the ``attributes`` bag (completeness matrix keys).
_ATTRIBUTE_KEYS = {
    "brand": ("brand",),
    "category": ("category", "collection", "product_type"),
    "gtin": ("gtin", "barcode", "upc", "ean", "gtin13"),
    "mpn": ("mpn",),
    "availability": ("availability", "stock_status"),
    "condition": ("condition",),
    "description": ("description", "desc"),
}

_ALIAS_SEPARATORS = ("|", ";")


class ProductCsvError(ValueError):
    """Raised when a product CSV cannot be parsed into unambiguous rows."""


class ProductCsvParseResult(NamedTuple):
    """Numbered import rows plus the per-row skips (D1 import feedback).

    ``rows`` pairs each parsed row with its 1-based DATA-row number (the
    header is row 0, fully-blank rows are dropped before numbering) — the
    same numbering the browser preview shows. ``errors`` carries the rows
    that were skipped (empty sku, failing field validation) with reasons.
    """

    rows: list[tuple[int, ProductInput]]
    errors: list[ProductImportRowError]


def _split_list(value: str) -> list[str]:
    for separator in _ALIAS_SEPARATORS:
        if separator in value:
            return [part.strip() for part in value.split(separator) if part.strip()]
    return [value.strip()] if value.strip() else []


def _parse_price(value: str) -> float | None:
    text = value.strip()
    if not text:
        return None
    # Tolerate currency symbols / thousand separators in the price column.
    text = text.replace(",", "")
    for symbol in ("US$", "AU$", "CA$", "A$", "C$", "$", "€", "£"):
        text = text.replace(symbol, "")
    text = text.strip()
    try:
        return round(float(text), 2)
    except ValueError:
        return None


def parse_product_csv(content: str) -> ProductCsvParseResult:
    """Parse CSV text into numbered ``ProductInput`` rows + row-level skips.

    Requires a header row with at least ``name`` and ``sku`` (aliases
    accepted, any column order). BOM-stripped; fully-blank rows are skipped.
    Rows with an empty ``sku`` or that fail ``ProductInput`` validation are
    skipped WITH a reason (D1 — previously silent / an unhandled 500); a
    missing ``name`` falls back to the sku.
    """
    text = content.lstrip("\ufeff")
    if not text.strip():
        return ProductCsvParseResult(rows=[], errors=[])
    reader = csv.reader(io.StringIO(text))
    rows: list[list[str]] = []
    for row in reader:
        if len(row) > IMPORT_MAX_COLUMNS:
            raise ProductCsvError("Product CSV has too many columns")
        if any(len(cell) > IMPORT_MAX_CELL_CHARS for cell in row):
            raise ProductCsvError("Product CSV cell is too long")
        if any(cell.strip() for cell in row):
            rows.append(row)
            if len(rows) > PRODUCT_IMPORT_MAX_ROWS + 1:
                raise ProductCsvError("Product CSV has too many rows")
    if not rows:
        return ProductCsvParseResult(rows=[], errors=[])

    header = [cell.strip().lower().replace(" ", "_") for cell in rows[0]]

    def _col(keys: set[str] | tuple[str, ...]) -> int | None:
        for index, name in enumerate(header):
            if name in keys:
                return index
        return None

    sku_i = _col(_SKU_KEYS)
    name_i = _col(_NAME_KEYS)
    # BOTH columns are required: `sku` is the (project_id, sku) import identity,
    # so a file without it has every row skipped below and would otherwise
    # "succeed" while importing nothing.
    if sku_i is None or name_i is None:
        raise ProductCsvError(
            "Product CSV must include a header row with at least 'sku' and "
            "'name' columns"
        )
    price_i = _col(_PRICE_KEYS)
    currency_i = _col(_CURRENCY_KEYS)
    url_i = _col(_URL_KEYS)
    aliases_i = _col(_ALIASES_KEYS)
    variant_i = _col(_VARIANT_KEYS)
    attribute_cols = {key: _col(aliases) for key, aliases in _ATTRIBUTE_KEYS.items()}

    def _cell(row: list[str], index: int | None) -> str:
        if index is None or index >= len(row):
            return ""
        return row[index].strip()

    products: list[tuple[int, ProductInput]] = []
    errors: list[ProductImportRowError] = []
    for row_number, row in enumerate(rows[1:], start=1):
        sku = _cell(row, sku_i)
        name = _cell(row, name_i)
        if not sku:
            # sku is the (project_id, sku) import identity — a row without one
            # cannot be de-duplicated, so it is skipped rather than guessed.
            errors.append(
                ProductImportRowError(
                    row=row_number,
                    field="sku",
                    message="Missing sku — the row was skipped "
                    "(sku is the import identity)",
                )
            )
            continue
        attributes = {
            key: _cell(row, index)
            for key, index in attribute_cols.items()
            if index is not None and _cell(row, index)
        }
        variant = _cell(row, variant_i)
        try:
            products.append(
                (
                    row_number,
                    ProductInput(
                        sku=sku,
                        name=name or sku,
                        aliases=_split_list(_cell(row, aliases_i)),
                        variants=[ProductVariant(name=variant)] if variant else [],
                        price=_parse_price(_cell(row, price_i)),
                        currency=_cell(row, currency_i),
                        url=_cell(row, url_i),
                        attributes=attributes,
                    ),
                )
            )
        except ValidationError as exc:
            # A row that fails field validation (e.g. an over-long name) is a
            # skipped row with a sanitized reason (COM-5), never a 500. Both
            # guards keep that promise: an empty sanitized list must not be
            # indexed, and a ``loc`` carrying a sequence index (``variants``,
            # 0) must not be str-joined as ints.
            sanitized = sanitize_validation_errors(exc.errors())
            first = sanitized[0] if sanitized else {}
            errors.append(
                ProductImportRowError(
                    row=row_number,
                    field=".".join(str(part) for part in first.get("loc", ())),
                    message=first.get("message") or "Invalid value",
                )
            )
    return ProductCsvParseResult(rows=products, errors=errors)
