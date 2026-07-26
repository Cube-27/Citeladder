"""Pre-persistence Shopify order sanitizer (commerce suite, invariant 6/7).

The connector returns structurally-normalized-but-RAW order nodes; the
integration WORKER runs this module on each raw page BEFORE the immutable
artifact write, so customer PII can never survive into an import artifact,
an ``OrderFact``, an attribution row, a DTO, or a log line.

Layering: this module is deliberately free of ANY ``app.domain`` /
``app.models`` import — it is a pure function over mappings + config. The
URL sanitizer is INJECTED by the worker (``sanitize_referral_url``) so the
dependency direction stays worker/domain -> connector with no inversion.

The sanitizer ALLOWLIST-CONSTRUCTS the output (it never copies-then-
deletes): only ``ORDER_SANITIZED_KEYS`` exist on the result. Everything
else the provider sent — customer, email, phone, addresses, payment,
note, note attributes, IP, discount details — is dropped by construction.
"""

from __future__ import annotations

import hashlib
import hmac
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from urllib.parse import parse_qsl, urlsplit

from app.core.config import settings
from app.core.config.commerce import (
    ORDER_ATTRIBUTION_KEY_ALLOWLIST,
    ORDER_JOURNEY_STATE_AVAILABLE,
    ORDER_JOURNEY_STATE_UNAVAILABLE,
    ORDER_REF_HASH_HEX_LENGTH,
    ORDER_SANITIZED_KEYS,
)

# The five UTM keys carried in ``attribution_keys`` (allowlist subset).
_UTM_KEYS: tuple[str, ...] = (
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
)
# Shopify ``utmParameters`` field name -> attribution key.
_UTM_PARAMETER_FIELDS: dict[str, str] = {
    "source": "utm_source",
    "medium": "utm_medium",
    "campaign": "utm_campaign",
    "term": "utm_term",
    "content": "utm_content",
}


@dataclass(frozen=True)
class SanitizedOrder:
    """The ONLY persistable shape of a provider order (allowlisted keys).

    ``total_amount``/``unit_price`` stay decimal STRINGS verbatim from the
    provider — no float rounding ever enters an artifact. ``cancelled_at``
    is "" when the order is not cancelled. ``journey_state`` is the
    explicit available/unavailable coverage token (never a guessed
    journey).
    """

    order_ref_hash: str
    occurred_at: str
    updated_at: str
    cancelled_at: str
    currency: str
    total_amount: str
    financial_status: str
    fulfillment_status: str
    journey_state: str
    line_items: tuple[dict[str, object], ...]
    attribution_keys: dict[str, str]

    def to_payload(self) -> dict[str, object]:
        """The JSON-persistable dict — exactly ``ORDER_SANITIZED_KEYS``."""
        payload: dict[str, object] = {
            "order_ref_hash": self.order_ref_hash,
            "occurred_at": self.occurred_at,
            "updated_at": self.updated_at,
            "cancelled_at": self.cancelled_at,
            "currency": self.currency,
            "total_amount": self.total_amount,
            "financial_status": self.financial_status,
            "fulfillment_status": self.fulfillment_status,
            "journey_state": self.journey_state,
            "line_items": [dict(item) for item in self.line_items],
            "attribution_keys": dict(self.attribution_keys),
        }
        # Construct-time proof: no unexpected key can ever leak through.
        assert set(payload) == ORDER_SANITIZED_KEYS  # noqa: S101
        return payload


def hash_order_ref(raw_order_id: object) -> str:
    """Opaque stable order identity: HMAC-SHA256 of the raw provider id.

    Keyed with the env-injected ``Settings.order_hash_salt`` (never logged,
    never in a DTO); the raw Shopify order id never persists. Returns the
    full ``ORDER_REF_HASH_HEX_LENGTH`` hex digest.
    """
    digest = hmac.new(
        settings.order_hash_salt.encode("utf-8"),
        str(raw_order_id).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return digest[:ORDER_REF_HASH_HEX_LENGTH]


def _str(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def _money_amount(value: object) -> str:
    """Extract ``<set>.shopMoney.amount`` as a verbatim decimal string."""
    if not isinstance(value, Mapping):
        return ""
    shop_money = value.get("shopMoney")
    if not isinstance(shop_money, Mapping):
        return ""
    return _str(shop_money.get("amount"))


def _money_currency(value: object) -> str:
    """Extract ``<set>.shopMoney.currencyCode`` (fallback currency source)."""
    if not isinstance(value, Mapping):
        return ""
    shop_money = value.get("shopMoney")
    if not isinstance(shop_money, Mapping):
        return ""
    return _str(shop_money.get("currencyCode"))


def _sanitize_line_item(value: object) -> dict[str, object] | None:
    """Allowlist one raw line item to ``sku``/``quantity``/``unit_price``.

    ``quantity`` is the CURRENT quantity (post-refund revisions); the raw
    ``quantity`` is only a fallback when the provider omits the current
    count. Names, gift messages, variant/product ids, tax lines, and
    arbitrary properties are dropped by construction.
    """
    if not isinstance(value, Mapping):
        return None
    quantity = value.get("currentQuantity")
    if not isinstance(quantity, int) or isinstance(quantity, bool):
        fallback = value.get("quantity")
        quantity = fallback if isinstance(fallback, int) and not isinstance(
            fallback, bool
        ) else 0
    return {
        "sku": _str(value.get("sku")),
        "quantity": quantity,
        "unit_price": _money_amount(value.get("originalUnitPriceSet")),
    }


def _utm_from_landing_url(landing_url: str) -> dict[str, str]:
    """Parse UTM values from the SANITIZED landing URL's query string."""
    if not landing_url:
        return {}
    parsed: dict[str, str] = {}
    for key, value in parse_qsl(urlsplit(landing_url).query):
        if key in _UTM_KEYS and value.strip() and key not in parsed:
            parsed[key] = value.strip()
    return parsed


def _journey_visit(raw: Mapping[str, object]) -> Mapping[str, object] | None:
    """The visit carrying attribution evidence, or ``None`` (unavailable).

    Only when ``customerJourneySummary.ready`` is exactly true: ``lastVisit``
    when present, else ``firstVisit``. A not-ready summary or missing visit
    yields EXPLICIT unavailable coverage — never a guessed journey.
    """
    summary = raw.get("customerJourneySummary")
    if not isinstance(summary, Mapping) or summary.get("ready") is not True:
        return None
    last = summary.get("lastVisit")
    if isinstance(last, Mapping):
        return last
    first = summary.get("firstVisit")
    if isinstance(first, Mapping):
        return first
    return None


def _attribution_keys(
    visit: Mapping[str, object] | None,
    *,
    url_sanitizer: Callable[[str | None], str],
) -> dict[str, str]:
    """Build the allowlisted, non-empty attribution evidence map.

    URLs pass through the injected sanitizer (fragments/credentials/non-
    allowlisted params removed) BEFORE persistence. UTM values come from
    the explicit ``utmParameters`` first, falling back to the sanitized
    landing URL's query string per key. Empty values never land.
    """
    if visit is None:
        return {}
    keys: dict[str, str] = {}
    landing_url = url_sanitizer(_str(visit.get("landingSiteUrl")) or None)
    referrer_url = url_sanitizer(_str(visit.get("referrerUrl")) or None)
    if landing_url:
        keys["landing_url"] = landing_url
    if referrer_url:
        keys["referrer_url"] = referrer_url
    source_name = _str(visit.get("source"))
    if source_name:
        keys["source_name"] = source_name
    from_url = _utm_from_landing_url(landing_url)
    parameters = visit.get("utmParameters")
    for field, utm_key in _UTM_PARAMETER_FIELDS.items():
        explicit = (
            _str(parameters.get(field)) if isinstance(parameters, Mapping) else ""
        )
        value = explicit or from_url.get(utm_key, "")
        if value:
            keys[utm_key] = value
    # Construct-time proof against future edits: the allowlist is absolute.
    assert set(keys) <= ORDER_ATTRIBUTION_KEY_ALLOWLIST  # noqa: S101
    return keys


def sanitize_order_payload(
    raw: Mapping[str, object],
    *,
    url_sanitizer: Callable[[str | None], str],
) -> SanitizedOrder:
    """Allowlist-construct the persistable order from a RAW order node.

    ``raw`` is one connector-normalized raw order node (its ``lineItems``
    already flattened to a plain list). Every value is coerced through a
    safe accessor; nothing is copied wholesale, so provider keys outside
    the allowlist — however hostile or nested — cannot survive.
    """
    raw_line_items = raw.get("lineItems")
    line_items = tuple(
        item
        for item in (
            _sanitize_line_item(value)
            for value in (raw_line_items if isinstance(raw_line_items, list) else [])
        )
        if item is not None
    )
    visit = _journey_visit(raw)
    currency = _str(raw.get("currencyCode")) or _money_currency(
        raw.get("currentTotalPriceSet")
    )
    return SanitizedOrder(
        order_ref_hash=hash_order_ref(raw.get("id")),
        occurred_at=_str(raw.get("createdAt")),
        updated_at=_str(raw.get("updatedAt")),
        cancelled_at=_str(raw.get("cancelledAt")),
        currency=currency,
        total_amount=_money_amount(raw.get("currentTotalPriceSet")),
        financial_status=_str(raw.get("displayFinancialStatus")),
        fulfillment_status=_str(raw.get("displayFulfillmentStatus")),
        journey_state=(
            ORDER_JOURNEY_STATE_AVAILABLE
            if visit is not None
            else ORDER_JOURNEY_STATE_UNAVAILABLE
        ),
        line_items=line_items,
        attribution_keys=_attribution_keys(visit, url_sanitizer=url_sanitizer),
    )
