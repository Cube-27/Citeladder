"""Server-resolved commercial quote and intent resolution."""

from __future__ import annotations

import hashlib
import hmac
import json
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.billing_catalog import (
    AddonCatalogEntry,
    CatalogPrice,
    CommercialCatalog,
    PlanCatalogEntry,
    QuantityBounds,
    TopupCatalogEntry,
    item_checkout_availability,
    plan_checkout_availability,
    resolve_region,
)
from app.core.config.billing_contracts import (
    ACTIVATION_KIND_ADDON,
    ACTIVATION_KIND_BASE,
    ACTIVATION_KIND_TOPUP,
    COMING_SOON_ADDON_KEYS,
    CREDENTIAL_MODE_BYOK,
    REASON_CATALOG_KEY_UNKNOWN,
    REASON_CHECKOUT_UNAVAILABLE,
    REASON_PROVIDER_UNAVAILABLE,
    REASON_QUANTITY_OUT_OF_BOUNDS,
)
from app.core.config.billing_settings import billing_settings
from app.core.config.billing_tax import (
    BillingIdentity,
    TaxPolicyError,
    calculate_tax,
    tax_snapshot,
)
from app.domain.billing.catalog_revisions import published_commercial_catalog
from app.domain.billing.schemas import MoneyResponse, ResolvedQuoteResponse


class BillingConflictError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class ResolvedIntent:
    """One validated commercial intent plus its server-resolved quote.

    ``price_ref``/``credit_price_ref`` are PRIVATE (never a DTO field): they
    are what the provider call is allowed to name.
    """

    kind: str
    catalog_key: str
    quantity: int
    credential_mode: str
    country_code: str
    region: str
    price_ref: str
    credit_price_ref: str
    quote: ResolvedQuoteResponse
    tax_snapshot: dict[str, object]


def _quote_secret() -> bytes:
    """The INDEPENDENT quote-signing secret, with no gateway fallback.

    Separation is checked against every registered provider's secrets rather
    than against whichever gateway is currently selected, so selecting a
    different provider can never make a previously-rejected reuse look valid.
    """
    from app.connectors.billing.registry import provider_secret_values

    secret = billing_settings.quote_signing_secret.get_secret_value()
    if not secret or secret in set(provider_secret_values()):
        raise BillingConflictError(REASON_CHECKOUT_UNAVAILABLE)
    return secret.encode()


def _quote_digest(payload: Mapping[str, object]) -> str:
    """Deterministic HMAC over the canonical quote payload."""
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hmac.new(_quote_secret(), canonical, hashlib.sha256).hexdigest()


def resolve_quote(
    *,
    kind: str,
    catalog_key: str,
    quantity: int,
    credential_mode: str,
    country_code: str,
    region: str,
    base: CatalogPrice,
    credit: CatalogPrice | None,
    catalog_revision: str,
    at: datetime,
    billing_identity: BillingIdentity,
) -> ResolvedQuoteResponse:
    """Produce the signed quote for one intent (pure, no I/O)."""
    base_total = base.amount_minor * quantity
    credit_total = credit.amount_minor * quantity if credit is not None else None
    subtotal_minor = base_total + (credit_total or 0)
    try:
        calculation = calculate_tax(
            subtotal_minor=subtotal_minor,
            discount_minor=0,
            currency=base.currency,
            country_code=country_code,
            identity=billing_identity,
        )
    except TaxPolicyError as error:
        raise BillingConflictError(REASON_CHECKOUT_UNAVAILABLE) from error
    private_tax_snapshot = tax_snapshot(
        identity=billing_identity, calculation=calculation
    )
    expires_at = at + timedelta(minutes=billing_settings.quote_validity_minutes)
    quote_id = _quote_digest(
        {
            "kind": kind,
            "catalog_key": catalog_key,
            "catalog_revision": catalog_revision,
            "quantity": quantity,
            "credential_mode": credential_mode,
            "country_code": country_code,
            "region": region,
            "currency": base.currency,
            "base_minor": base_total,
            "credit_minor": credit_total,
            "tax": calculation.snapshot(),
            "billing_identity": billing_identity.snapshot(),
            "seller_tax_snapshot": private_tax_snapshot["seller"],
            "expires_at": expires_at.isoformat(),
            "price_ref": base.provider_price_ref,
            "credit_price_ref": credit.provider_price_ref if credit else "",
        }
    )
    return ResolvedQuoteResponse(
        quote_id=quote_id,
        catalog_revision=catalog_revision,
        catalog_key=catalog_key,
        credential_mode=credential_mode,
        country_code=country_code,
        region=region,
        base_price=MoneyResponse(currency=base.currency, amount_minor=base_total),
        credit_price=(
            MoneyResponse(currency=base.currency, amount_minor=credit_total)
            if credit_total is not None
            else None
        ),
        subtotal_price=MoneyResponse(
            currency=base.currency, amount_minor=subtotal_minor
        ),
        discount=MoneyResponse(
            currency=base.currency, amount_minor=calculation.discount_minor
        ),
        taxable_value=MoneyResponse(
            currency=base.currency, amount_minor=calculation.taxable_minor
        ),
        tax_treatment=calculation.treatment,
        tax_rate=calculation.tax_rate,
        cgst=MoneyResponse(currency=base.currency, amount_minor=calculation.cgst_minor),
        sgst=MoneyResponse(currency=base.currency, amount_minor=calculation.sgst_minor),
        igst=MoneyResponse(currency=base.currency, amount_minor=calculation.igst_minor),
        tax_policy_version=calculation.policy_version,
        tax=MoneyResponse(currency=base.currency, amount_minor=calculation.tax_minor),
        total_price=MoneyResponse(
            currency=base.currency, amount_minor=calculation.total_minor
        ),
        expires_at=expires_at,
    )


async def resolve_base_intent(
    session: AsyncSession,
    *,
    catalog_key: str,
    credential_mode: str,
    country_code: str,
    billing_identity: BillingIdentity,
    at: datetime,
    _catalog_loader: Callable[[AsyncSession], Awaitable[CommercialCatalog]]
    | None = None,
    _checkout_availability: Callable[[PlanCatalogEntry, str], tuple[bool, str | None]]
    | None = None,
) -> ResolvedIntent:
    """Validate a base-plan purchase and resolve its quote server-side."""
    if credential_mode != CREDENTIAL_MODE_BYOK:
        raise BillingConflictError(REASON_CHECKOUT_UNAVAILABLE)
    region = resolve_region(country_code)
    catalog = await (_catalog_loader or published_commercial_catalog)(session)
    plan = catalog.plan(catalog_key)
    if plan is None:
        raise BillingConflictError(REASON_CATALOG_KEY_UNKNOWN)
    availability = _checkout_availability or plan_checkout_availability
    available, reason = availability(plan, region)
    if not available:
        raise BillingConflictError(reason or REASON_CHECKOUT_UNAVAILABLE)
    base = plan.base_price(region)
    if base is None:
        raise BillingConflictError(REASON_CHECKOUT_UNAVAILABLE)
    # Funded checkout is explicitly unavailable above; BYOK has no credit line.
    credit = None
    quote = resolve_quote(
        kind=ACTIVATION_KIND_BASE,
        catalog_key=catalog_key,
        quantity=1,
        credential_mode=credential_mode,
        country_code=country_code,
        region=region,
        base=base,
        credit=credit,
        catalog_revision=catalog.revision,
        at=at,
        billing_identity=billing_identity,
    )
    calculation = calculate_tax(
        subtotal_minor=quote.subtotal_price.amount_minor,
        discount_minor=quote.discount.amount_minor,
        currency=quote.subtotal_price.currency,
        country_code=country_code,
        identity=billing_identity,
    )
    return ResolvedIntent(
        kind=ACTIVATION_KIND_BASE,
        catalog_key=catalog_key,
        quantity=1,
        credential_mode=credential_mode,
        country_code=country_code,
        region=region,
        price_ref=base.provider_price_ref,
        credit_price_ref=credit.provider_price_ref if credit is not None else "",
        tax_snapshot=tax_snapshot(identity=billing_identity, calculation=calculation),
        quote=quote,
    )


def _bounded_quantity(quantity: int, bounds: QuantityBounds) -> int:
    if not bounds.minimum <= quantity <= bounds.maximum:
        raise BillingConflictError(REASON_QUANTITY_OUT_OF_BOUNDS)
    return quantity


def _resolve_pack_intent(
    *,
    kind: str,
    item: AddonCatalogEntry | TopupCatalogEntry,
    quantity: int,
    country_code: str,
    region: str,
    catalog_revision: str,
    at: datetime,
    billing_identity: BillingIdentity | None = None,
) -> ResolvedIntent:
    """Validate a quantity-bounded pack purchase and resolve its quote."""
    _bounded_quantity(quantity, item.quantity_bounds)
    price = item.price(region)
    available, reason = item_checkout_availability(
        availability=item.availability, price=price, region=region
    )
    if not available or price is None:
        raise BillingConflictError(reason or REASON_CHECKOUT_UNAVAILABLE)
    if billing_identity is None:
        raise BillingConflictError(REASON_CHECKOUT_UNAVAILABLE)
    quote = resolve_quote(
        kind=kind,
        catalog_key=item.key,
        quantity=quantity,
        credential_mode=CREDENTIAL_MODE_BYOK,
        country_code=country_code,
        region=region,
        base=price,
        credit=None,
        catalog_revision=catalog_revision,
        at=at,
        billing_identity=billing_identity,
    )
    calculation = calculate_tax(
        subtotal_minor=quote.subtotal_price.amount_minor,
        discount_minor=quote.discount.amount_minor,
        currency=quote.subtotal_price.currency,
        country_code=country_code,
        identity=billing_identity,
    )
    return ResolvedIntent(
        kind=kind,
        catalog_key=item.key,
        quantity=quantity,
        credential_mode=CREDENTIAL_MODE_BYOK,
        country_code=country_code,
        region=region,
        price_ref=price.provider_price_ref,
        credit_price_ref="",
        tax_snapshot=tax_snapshot(identity=billing_identity, calculation=calculation),
        quote=quote,
    )


async def resolve_addon_intent(
    session: AsyncSession,
    *,
    catalog_key: str,
    quantity: int,
    country_code: str,
    at: datetime,
    billing_identity: BillingIdentity | None = None,
    _catalog_loader: Callable[[AsyncSession], Awaitable[CommercialCatalog]]
    | None = None,
) -> ResolvedIntent:
    """Resolve an add-on intent; coming-soon items fail before provider I/O."""
    if catalog_key in COMING_SOON_ADDON_KEYS:
        raise BillingConflictError(REASON_PROVIDER_UNAVAILABLE)
    region = resolve_region(country_code)
    catalog = await (_catalog_loader or published_commercial_catalog)(session)
    addon = catalog.addon(catalog_key)
    if addon is None:
        raise BillingConflictError(REASON_CATALOG_KEY_UNKNOWN)
    return _resolve_pack_intent(
        kind=ACTIVATION_KIND_ADDON,
        item=addon,
        quantity=quantity,
        country_code=country_code,
        region=region,
        catalog_revision=catalog.revision,
        at=at,
        billing_identity=billing_identity,
    )


async def resolve_topup_intent(
    session: AsyncSession,
    *,
    catalog_key: str,
    quantity: int,
    country_code: str,
    at: datetime,
    billing_identity: BillingIdentity | None = None,
    _catalog_loader: Callable[[AsyncSession], Awaitable[CommercialCatalog]]
    | None = None,
) -> ResolvedIntent:
    """Validate a top-up purchase and resolve its quote server-side."""
    region = resolve_region(country_code)
    catalog = await (_catalog_loader or published_commercial_catalog)(session)
    topup = catalog.topup(catalog_key)
    if topup is None:
        raise BillingConflictError(REASON_CATALOG_KEY_UNKNOWN)
    return _resolve_pack_intent(
        kind=ACTIVATION_KIND_TOPUP,
        item=topup,
        quantity=quantity,
        country_code=country_code,
        region=region,
        catalog_revision=catalog.revision,
        at=at,
        billing_identity=billing_identity,
    )


__all__ = [
    "BillingConflictError",
    "ResolvedIntent",
    "resolve_addon_intent",
    "resolve_base_intent",
    "resolve_quote",
    "resolve_topup_intent",
]
