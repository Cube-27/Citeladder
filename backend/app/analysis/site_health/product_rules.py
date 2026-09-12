"""Deterministic product and category readiness composites."""

from __future__ import annotations

from datetime import UTC, date, datetime

from app.core.config.site_health_contracts import (
    RULE_OUTCOME_MISSING,
    RULE_OUTCOME_NOT_APPLICABLE,
    RULE_OUTCOME_SATISFIED,
    RULE_OUTCOME_UNKNOWN,
)
from app.core.config.site_health_rule_types import CompositeContract


def _count(value: object) -> int:
    if not isinstance(value, int | float | str):
        return 0
    try:
        return int(value)
    except (TypeError, ValueError, OverflowError):
        return 0


def _present(value: object) -> str:
    return RULE_OUTCOME_SATISFIED if bool(value) else RULE_OUTCOME_MISSING


def _product_signals(facts: dict) -> tuple[dict, dict, dict]:
    entity = (facts.get("entity") or {}).get("product") or {}
    schema = (facts.get("structured_data") or {}).get("product") or {}
    commerce = facts.get("commerce") or {}
    return entity, schema, commerce


def _availability(schema: dict, commerce: dict) -> list[str]:
    values = [str(value) for value in schema.get("availability") or () if value]
    visible = str(commerce.get("visible_availability") or "").strip()
    if visible:
        values.append(visible)
    return list(dict.fromkeys(values))


def _quote_led(facts: dict) -> bool:
    phrases = [str(value) for value in facts.get("cta_text") or ()]
    phrases.extend(
        f"{item.get('anchor_text', '')} {item.get('url', '')}"
        for item in (facts.get("links") or {}).get("anchors") or ()
        if item.get("region") == "main"
    )
    return any(
        any(
            action in value.casefold()
            for action in ("request a quote", "get a quote", "request pricing")
        )
        for value in phrases
    )


def _product_answer_observations(facts: dict) -> dict:
    entity, schema, commerce = _product_signals(facts)
    headings = facts.get("headings") or {}
    price = bool(entity.get("has_primary_price") or schema.get("price"))
    currency = bool(schema.get("price_currency")) or bool(
        any(symbol in str(commerce.get("visible_price") or "") for symbol in "$€£¥")
    )
    quote_led = _quote_led(facts)
    public_sale = bool(entity.get("has_purchase_control")) and not quote_led
    return {
        "identity": bool(headings.get("h1_texts") or schema.get("name")),
        "price": price,
        "currency": currency,
        "quote_led": quote_led,
        "public_sale": public_sale,
        "offer": quote_led or (public_sale and price and currency),
        "availability": _availability(schema, commerce),
        "variants": bool(entity.get("has_variant_control") or schema.get("variants")),
    }


def check_product_answer_facts(
    facts: dict, *, contract: CompositeContract
) -> tuple[str, dict]:
    """Score required PDP facts and a trait-gated variants atom."""
    observed = _product_answer_observations(facts)
    traits = facts.get("page_traits") or ()
    atoms = [
        contract.atom_detail(
            "identity",
            satisfied=observed["identity"],
            evidence=observed["identity"],
            page_traits=traits,
        ),
        contract.atom_detail(
            "offer",
            satisfied=observed["offer"],
            evidence=observed["offer"],
            page_traits=traits,
        ),
        contract.atom_detail(
            "availability",
            satisfied=observed["quote_led"] or bool(observed["availability"]),
            evidence=observed["availability"][:8],
            page_traits=traits,
        ),
        contract.atom_detail(
            "variants",
            satisfied=observed["variants"],
            evidence=observed["variants"],
            page_traits=traits,
        ),
    ]
    return contract.outcome_for(atoms), {
        "atoms": atoms,
        "threshold": contract.threshold,
        "public_sale": observed["public_sale"],
        "quote_led": observed["quote_led"],
        "transaction_path": observed["public_sale"] or observed["quote_led"],
        "price_observed": observed["price"],
        "currency_observed": observed["currency"],
    }


def check_offer_freshness_signal(facts: dict) -> tuple[str, dict]:
    """Validate an applicable authored offer expiry at the frozen audit time."""
    entity, schema, commerce = _product_signals(facts)
    offer = bool(
        entity.get("has_primary_price")
        or schema.get("price")
        or commerce.get("visible_price")
    )
    currency = [str(value) for value in schema.get("price_currency") or () if value]
    timestamp, timestamp_source, expiry_state = _offer_freshness_timestamp(
        facts, schema
    )
    evidence = {
        "offer": offer,
        "currency": list(dict.fromkeys(currency))[:8],
        "timestamp": timestamp,
        "timestamp_source": timestamp_source,
        "expiry_state": expiry_state,
    }
    if _quote_led(facts):
        return RULE_OUTCOME_NOT_APPLICABLE, {
            **evidence,
            "reason": "quote_led_offer",
        }
    if not offer:
        return RULE_OUTCOME_MISSING, {**evidence, "reason": "offer_state_missing"}
    if not currency:
        return RULE_OUTCOME_MISSING, {
            **evidence,
            "reason": "offer_currency_missing",
        }
    if expiry_state == "not_declared":
        return RULE_OUTCOME_NOT_APPLICABLE, {
            **evidence,
            "reason": "expiry_not_declared",
        }
    if expiry_state != "current":
        outcome = (
            RULE_OUTCOME_UNKNOWN
            if expiry_state == "audit_time_unavailable"
            else RULE_OUTCOME_MISSING
        )
        return outcome, {**evidence, "reason": expiry_state}
    return RULE_OUTCOME_SATISFIED, evidence


def check_product_evidence_facts(facts: dict) -> tuple[str, dict]:
    """Require a stable visible or machine-readable product identifier."""
    entity, schema, _commerce = _product_signals(facts)
    identifiers = [
        *(schema.get("sku") or ()),
        *(schema.get("gtin") or ()),
        *(schema.get("mpn") or ()),
    ]
    visible_marker = bool(entity.get("has_sku_marker"))
    return _present(identifiers or visible_marker), {
        "identifiers": [str(value) for value in identifiers[:12]],
        "visible_identifier_marker": visible_marker,
    }


def check_product_brand_identity(facts: dict) -> tuple[str, dict]:
    """Require a product-owned brand or manufacturer identity."""
    entity, schema, _commerce = _product_signals(facts)
    visible = [str(value) for value in entity.get("brand_names") or () if value]
    declared = [str(value) for value in schema.get("brand") or () if value]
    brands = list(dict.fromkeys([*visible, *declared]))
    return _present(brands), {"brands": brands[:8], "visible_brands": visible[:8]}


def _listing_signals(facts: dict) -> tuple[bool, int, bool]:
    headings = facts.get("headings") or {}
    entity = (facts.get("entity") or {}).get("listing") or {}
    commerce = facts.get("commerce") or {}
    purpose = bool(headings.get("h1_texts"))
    item_count = max(
        _count(entity.get("distinct_card_list_targets")),
        len(commerce.get("product_cards") or ()),
    )
    return purpose, item_count, bool(entity.get("has_empty_state"))


def check_listing_answer_set(
    facts: dict, *, contract: CompositeContract
) -> tuple[str, dict]:
    """Require both a collection purpose and a crawlable item set."""
    purpose, item_count, empty_state = _listing_signals(facts)
    traits = facts.get("page_traits") or ()
    atoms = [
        contract.atom_detail(
            "collection_purpose",
            satisfied=purpose,
            evidence=purpose,
            page_traits=traits,
        ),
        contract.atom_detail(
            "item_set",
            satisfied=bool(item_count) or empty_state,
            evidence={"item_count": item_count, "empty_state": empty_state},
            page_traits=traits,
        ),
    ]
    return contract.outcome_for(atoms), {
        "atoms": atoms,
        "threshold": contract.threshold,
    }


def check_assortment_freshness_signal(facts: dict) -> tuple[str, dict]:
    """Require a dated assortment observation; item count is not freshness."""
    timestamp, timestamp_source = _freshness_timestamp(facts)
    if not timestamp:
        return RULE_OUTCOME_MISSING, {
            "reason": "freshness_signal_missing",
            "timestamp": "",
            "timestamp_source": "",
        }
    return RULE_OUTCOME_SATISFIED, {
        "timestamp": timestamp,
        "timestamp_source": timestamp_source,
    }


def _freshness_timestamp(facts: dict) -> tuple[str, str]:
    dates = facts.get("dates") or {}
    for key in ("modified", "published"):
        timestamp = str(dates.get(key) or "").strip()
        if timestamp:
            return timestamp[:128], key
    return "", ""


def _offer_freshness_timestamp(facts: dict, schema: dict) -> tuple[str, str, str]:
    validity = next(
        (
            str(value).strip()
            for value in schema.get("price_valid_until") or ()
            if value
        ),
        "",
    )
    if validity:
        state = _offer_validity_state(validity, facts.get("audit_time"))
        return validity[:128], "offer_price_valid_until", state
    return "", "", "not_declared"


def _offer_validity_state(value: str, audit_time: object) -> str:
    try:
        valid_until = date.fromisoformat(value[:10])
    except ValueError:
        return "invalid_expiry"
    try:
        observed_at = datetime.fromisoformat(str(audit_time).replace("Z", "+00:00"))
    except ValueError:
        return "audit_time_unavailable"
    if observed_at.tzinfo is None:
        observed_at = observed_at.replace(tzinfo=UTC)
    return "current" if valid_until >= observed_at.astimezone(UTC).date() else "expired"


def check_listing_item_facts(facts: dict) -> tuple[str, dict]:
    """Require crawlable category items with bounded labels and targets."""
    cards = (facts.get("commerce") or {}).get("product_cards") or ()
    complete = list(filter(None, map(_listing_item_fact, cards)))
    listing = (facts.get("entity") or {}).get("listing") or {}
    empty_state = bool(listing.get("has_empty_state"))
    if empty_state and not cards:
        return RULE_OUTCOME_NOT_APPLICABLE, {
            "reason": "explicit_empty_collection",
            "item_fact_count": 0,
            "items": [],
        }
    item_count = len(complete)
    return _present(item_count), {
        "item_fact_count": item_count,
        "items": complete[:12],
    }


def _listing_item_fact(card: dict) -> dict | None:
    """Normalize one complete crawlable listing card for persisted evidence."""
    title = str(card.get("title") or "")
    url = str(card.get("url") or "")
    if not title.strip() or not url.strip():
        return None
    return {"title": title[:256], "url": url[:512]}
