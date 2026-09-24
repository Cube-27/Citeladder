"""Public billing catalog projection."""
# The DTO projection is intentionally kept close to its source fields.

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.billing_catalog import (
    AddonCatalogEntry,
    CatalogPrice,
    CommercialCatalog,
    PlanCatalogEntry,
    TopupCatalogEntry,
    plan_checkout_availability,
    resolve_region,
)
from app.core.config.billing_contracts import (
    COMING_SOON_PLAN_CAPABILITY_KEYS,
    COMING_SOON_ROW_PLAN_KEYS,
    CURRENCY_MINOR_UNITS,
    REGION_CURRENCIES,
)
from app.core.config.billing_settings import billing_settings
from app.core.config.entitlements import (
    CAPABILITY_REGISTRY,
    CapabilityDefinition,
    CapabilityType,
)
from app.core.config.provider_catalog import (
    ProviderCatalogEntry,
    public_provider_routes,
)
from app.domain.billing.catalog_revisions import (
    commercial_catalog_from_row,
    published_revision,
    validate_payload,
)
from app.domain.billing.schemas import (
    BillingCatalogResponse,
    CapabilityValueResponse,
    CatalogAddonResponse,
    CatalogGrantResponse,
    CatalogPlanResponse,
    CatalogProviderResponse,
    CatalogProviderRouteResponse,
    CatalogSupportContactResponse,
    CatalogTopupResponse,
    MoneyResponse,
)
from app.models.billing import BillingCatalogRevision


def _money(price: CatalogPrice | None) -> MoneyResponse | None:
    if price is None:
        return None
    return MoneyResponse(currency=price.currency, amount_minor=price.amount_minor)


def _capability_value(
    definition: CapabilityDefinition, value: int | None
) -> bool | int | str | None:
    if value is None:
        return None
    if definition.capability_type is CapabilityType.FLAG:
        return bool(value)
    if definition.capability_type is CapabilityType.LEVEL:
        return definition.ordered_values[value]
    return value


def _plan_capabilities(plan: PlanCatalogEntry) -> list[CapabilityValueResponse]:
    granted = {template.key: template.value for template in plan.grant_bundle}
    rows: list[CapabilityValueResponse] = []
    for definition in CAPABILITY_REGISTRY.public_entries():
        coming_soon = definition.key in COMING_SOON_PLAN_CAPABILITY_KEYS
        if coming_soon and plan.key not in COMING_SOON_ROW_PLAN_KEYS:
            continue
        if definition.key not in granted and not coming_soon:
            continue
        rows.append(
            CapabilityValueResponse(
                key=definition.key,
                capability_type=definition.capability_type.value,
                value=_capability_value(definition, granted.get(definition.key)),
                issuable=definition.issuable,
            )
        )
    return rows


def _plan_response(plan: PlanCatalogEntry, region: str) -> CatalogPlanResponse:
    base = plan.base_price(region)
    credit = plan.credit_price(region)
    checkout_available, unavailable_reason = plan_checkout_availability(plan, region)
    funded_total = (
        MoneyResponse(
            currency=base.currency, amount_minor=base.amount_minor + credit.amount_minor
        )
        if base is not None and credit is not None
        else None
    )
    return CatalogPlanResponse(
        key=plan.key,
        name=plan.name,
        description=plan.description,
        cadence=plan.cadence,
        self_serve=plan.self_serve,
        contact_only=plan.contact_only,
        contact_url=billing_settings.contact_sales_url if plan.contact_only else None,
        base_price=_money(base),
        credit_price=_money(credit),
        funded_total_price=funded_total,
        checkout_available=checkout_available,
        unavailable_reason=unavailable_reason,
        capabilities=_plan_capabilities(plan),
        trial_availability=plan.trial_availability,
        trial_unavailable_reason=plan.trial_unavailable_reason,
        trial_days=billing_settings.trial_days,
    )


def _item_fields(
    item: AddonCatalogEntry | TopupCatalogEntry, region: str
) -> dict[str, object]:
    return {
        "key": item.key,
        "name": item.name,
        "description": item.description,
        "unit_price": _money(item.price(region)),
        "quantity_min": item.quantity_bounds.minimum,
        "quantity_max": item.quantity_bounds.maximum,
        "availability": item.availability,
        "unavailable_reason": item.unavailable_reason,
        "grants_per_unit": [
            CatalogGrantResponse(key=template.key, value=template.value)
            for template in item.grant_bundle_per_unit
        ],
        "eligible_plan_keys": list(item.eligible_plan_keys),
        "expiry_days": item.expiry_days,
    }


def _support_contact(
    row: BillingCatalogRevision,
) -> CatalogSupportContactResponse | None:
    contact = validate_payload(row.payload).support_contact
    if contact is None:
        return None
    return CatalogSupportContactResponse(
        email=contact.email,
        phone=contact.phone or None,
        contact_url=contact.contact_url,
    )


def _provider_response(provider: ProviderCatalogEntry) -> CatalogProviderResponse:
    return CatalogProviderResponse(
        key=provider.key,
        label=provider.label,
        availability=provider.availability,
        unavailable_reason=provider.unavailable_reason,
        adapter_shipped=provider.adapter_shipped,
        grant_key=provider.grant_key,
        issuable=provider.issuable,
        routes=[
            CatalogProviderRouteResponse(
                logical_engine=route.logical_engine,
                transport_provider=route.transport_provider,
                model=route.transport_model,
            )
            for route in public_provider_routes(provider.key)
        ],
    )


async def public_catalog(
    session: AsyncSession, country_code: str | None
) -> BillingCatalogResponse:
    normalized = (country_code or "").strip().upper() or None
    region = resolve_region(normalized)
    currency = REGION_CURRENCIES[region]
    row = await published_revision(session)
    catalog: CommercialCatalog = commercial_catalog_from_row(row)
    return BillingCatalogResponse(
        catalog_revision=catalog.revision,
        country_code=normalized,
        region=region,
        currency=currency,
        currency_minor_units=CURRENCY_MINOR_UNITS[currency],
        plans=[_plan_response(plan, region) for plan in catalog.plans],
        addons=[
            CatalogAddonResponse.model_validate(_item_fields(addon, region))
            for addon in catalog.addons
        ],
        topups=[
            CatalogTopupResponse.model_validate(_item_fields(topup, region))
            for topup in catalog.topups
        ],
        providers=[_provider_response(provider) for provider in catalog.providers],
        support_contact=_support_contact(row),
    )
