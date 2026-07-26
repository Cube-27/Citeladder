"""Pre-persistence order sanitizer: PII can never survive (invariant 7).

Pure unit tests over the allowlist-constructing sanitizer the integration
worker runs on every raw Shopify order page BEFORE the immutable artifact
write. Asserts the hostile-PII drop-by-construction contract, the URL
sanitization + UTM precedence rules, the explicit journey-coverage token,
and the opaque stable order-ref hash.
"""

from __future__ import annotations

import json

from app.core.config.commerce import (
    ORDER_ATTRIBUTION_KEY_ALLOWLIST,
    ORDER_JOURNEY_STATE_AVAILABLE,
    ORDER_JOURNEY_STATE_UNAVAILABLE,
    ORDER_LINE_ITEM_KEYS,
    ORDER_REF_HASH_HEX_LENGTH,
    ORDER_SANITIZED_KEYS,
)
from app.domain.analytics.sanitize import sanitize_referral_url
from app.domain.commerce.sanitize import (
    hash_order_ref,
    sanitize_order_payload,
)

_PII_STRINGS = (
    "buyer@example.com",
    "ada@example.com",
    "Ada",
    "Lovelace",
    "555-0100",
    "203.0.113.7",
    "happy birthday",
    "shopify_payments",
)


def _raw_order() -> dict:
    """A hostile RAW order node (connector-normalized shape + PII galore)."""
    return {
        "id": "gid://shopify/Order/5678901234",
        "createdAt": "2026-07-01T10:15:00Z",
        "updatedAt": "2026-07-02T11:00:00Z",
        "cancelledAt": None,
        "currencyCode": "USD",
        "currentTotalPriceSet": {
            "shopMoney": {"amount": "129.98", "currencyCode": "USD"}
        },
        "displayFinancialStatus": "PAID",
        "displayFulfillmentStatus": "FULFILLED",
        # --- everything below this line is PII / provider detail that must
        # never survive -----------------------------------------------
        "email": "buyer@example.com",
        "phone": "+1-555-0100",
        "customer": {
            "id": "gid://shopify/Customer/1",
            "firstName": "Ada",
            "lastName": "Lovelace",
            "email": "ada@example.com",
            "addresses": [{"address1": "1 Infinite Loop", "zip": "95014"}],
        },
        "billingAddress": {"name": "Ada Lovelace", "phone": "555-0100"},
        "shippingAddress": {"name": "Ada Lovelace", "address1": "1 Infinite Loop"},
        "note": "leave at door, call 555-0100",
        "noteAttributes": [{"name": "gift_message", "value": "happy birthday"}],
        "paymentGatewayNames": ["shopify_payments"],
        "clientIp": "203.0.113.7",
        "lineItems": [
            {
                "sku": "VC-500",
                "quantity": 2,
                "currentQuantity": 1,
                "name": "VoltCity 500",
                "originalUnitPriceSet": {
                    "shopMoney": {"amount": "64.99", "currencyCode": "USD"}
                },
                "variant": {
                    "id": "gid://shopify/ProductVariant/9",
                    "product": {"id": "gid://shopify/Product/3"},
                },
                "customAttributes": [{"key": "msg", "value": "happy birthday"}],
            },
            {
                "sku": "VC-900",
                "quantity": 1,
                "originalUnitPriceSet": {
                    "shopMoney": {"amount": "0.00", "currencyCode": "USD"}
                },
            },
        ],
        "customerJourneySummary": {
            "ready": True,
            "firstVisit": {
                "landingSiteUrl": "https://volt-city.example/?utm_source=first",
                "referrerUrl": "",
                "source": "DIRECT",
            },
            "lastVisit": {
                "landingSiteUrl": (
                    "https://user:pass@volt-city.example/products/vc-500"
                    "?utm_source=newsletter&utm_medium=email&gclid=abc123#frag"
                ),
                "referrerUrl": ("https://google.com/search?q=voltcity&fbclid=xyz"),
                "source": "SEARCH",
                "utmParameters": {
                    "source": "google",
                    "medium": "cpc",
                    "campaign": "summer",
                    "term": None,
                    "content": None,
                },
            },
        },
    }


def _sanitize(raw: dict) -> dict:
    return sanitize_order_payload(raw, url_sanitizer=sanitize_referral_url).to_payload()


def test_payload_keys_are_exactly_the_allowlist() -> None:
    payload = _sanitize(_raw_order())
    assert set(payload) == ORDER_SANITIZED_KEYS
    assert set(payload["attribution_keys"]) <= ORDER_ATTRIBUTION_KEY_ALLOWLIST
    for item in payload["line_items"]:
        assert set(item) == set(ORDER_LINE_ITEM_KEYS)


def test_no_pii_string_survives_anywhere_in_the_payload() -> None:
    serialized = json.dumps(_sanitize(_raw_order()))
    for pii in _PII_STRINGS:
        assert pii not in serialized


def test_scalar_fields_are_verbatim_provider_values() -> None:
    payload = _sanitize(_raw_order())
    assert payload["occurred_at"] == "2026-07-01T10:15:00Z"
    assert payload["updated_at"] == "2026-07-02T11:00:00Z"
    assert payload["cancelled_at"] == ""
    assert payload["currency"] == "USD"
    # Decimal strings stay verbatim — no float rounding ever enters.
    assert payload["total_amount"] == "129.98"
    assert payload["financial_status"] == "PAID"
    assert payload["fulfillment_status"] == "FULFILLED"
    assert payload["journey_state"] == ORDER_JOURNEY_STATE_AVAILABLE


def test_landing_url_credentials_fragment_and_non_allowlisted_params_dropped() -> None:
    keys = _sanitize(_raw_order())["attribution_keys"]
    assert (
        keys["landing_url"]
        == "https://volt-city.example/products/vc-500?utm_source=newsletter&utm_medium=email"
    )
    assert keys["referrer_url"] == "https://google.com/search"
    assert keys["source_name"] == "SEARCH"


def test_utm_parameters_beat_landing_url_query_values() -> None:
    keys = _sanitize(_raw_order())["attribution_keys"]
    # Explicit utmParameters win per key over the URL's own query string.
    assert keys["utm_source"] == "google"
    assert keys["utm_medium"] == "cpc"
    assert keys["utm_campaign"] == "summer"
    # Empty explicit values fall back to nothing (URL has no term/content).
    assert "utm_term" not in keys
    assert "utm_content" not in keys


def test_utm_falls_back_to_landing_url_query_when_no_parameters() -> None:
    raw = _raw_order()
    visit = raw["customerJourneySummary"]["lastVisit"]
    del visit["utmParameters"]
    keys = _sanitize(raw)["attribution_keys"]
    assert keys["utm_source"] == "newsletter"
    assert keys["utm_medium"] == "email"


def test_last_visit_preferred_over_first_visit() -> None:
    raw = _raw_order()
    # firstVisit says DIRECT/first; lastVisit (used) says SEARCH/google.
    keys = _sanitize(raw)["attribution_keys"]
    assert keys["source_name"] == "SEARCH"
    assert "utm_source" in keys and keys["utm_source"] != "first"


def test_first_visit_used_when_no_last_visit() -> None:
    raw = _raw_order()
    summary = raw["customerJourneySummary"]
    summary["lastVisit"] = None
    keys = _sanitize(raw)["attribution_keys"]
    assert keys["source_name"] == "DIRECT"
    assert keys["utm_source"] == "first"


def test_journey_unavailable_is_explicit_never_guessed() -> None:
    for mutate in (
        lambda raw: raw["customerJourneySummary"].update(ready=False),
        lambda raw: raw.pop("customerJourneySummary"),
        lambda raw: raw["customerJourneySummary"].update(
            lastVisit=None, firstVisit=None
        ),
        lambda raw: raw.update(customerJourneySummary="hostile-non-mapping"),
    ):
        raw = _raw_order()
        mutate(raw)
        payload = _sanitize(raw)
        assert payload["journey_state"] == ORDER_JOURNEY_STATE_UNAVAILABLE
        assert payload["attribution_keys"] == {}


def test_line_items_use_current_quantity_and_verbatim_unit_price() -> None:
    items = _sanitize(_raw_order())["line_items"]
    assert items == [
        {"sku": "VC-500", "quantity": 1, "unit_price": "64.99"},
        {"sku": "VC-900", "quantity": 1, "unit_price": "0.00"},
    ]


def test_currency_falls_back_to_price_set_currency() -> None:
    raw = _raw_order()
    del raw["currencyCode"]
    assert _sanitize(raw)["currency"] == "USD"


def test_order_ref_hash_is_opaque_stable_and_full_length() -> None:
    digest = hash_order_ref("gid://shopify/Order/5678901234")
    assert digest == hash_order_ref("gid://shopify/Order/5678901234")
    assert len(digest) == ORDER_REF_HASH_HEX_LENGTH
    assert all(char in "0123456789abcdef" for char in digest)
    # The raw provider id is never recoverable from the persisted hash.
    assert "5678901234" not in digest
    assert digest != hash_order_ref("gid://shopify/Order/5678901235")


def test_non_mapping_line_items_and_missing_lists_degrade_safely() -> None:
    raw = _raw_order()
    raw["lineItems"] = ["hostile", None, 42]
    assert _sanitize(raw)["line_items"] == []
    raw["lineItems"] = None
    assert _sanitize(raw)["line_items"] == []
