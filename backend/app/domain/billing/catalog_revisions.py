"""Persisted immutable commercial catalog validation and publication."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from math import ceil
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.billing_catalog import (
    AddonCatalogEntry,
    CatalogPrice,
    CommercialCatalog,
    GrantTemplate,
    PlanCatalogEntry,
    QuantityBounds,
    TopupCatalogEntry,
)
from app.core.config.billing_contracts import (
    CADENCE_MONTHLY,
    PLAN_ENTERPRISE,
    PLAN_TIER_1,
    PLAN_TIER_2,
    PLAN_TIER_3,
    REASON_CHECKOUT_UNAVAILABLE,
    REASON_CONTACT_ONLY,
    REASON_TRIAL_UNAVAILABLE,
    TAX_BEHAVIOR_INCLUSIVE,
)
from app.core.config.billing_pricing import inr_minor_from_usd_minor
from app.core.config.entitlements import (
    CAPABILITY_REGISTRY,
    KEY_AGENT,
    CapabilityType,
)
from app.core.config.provider_catalog import PUBLIC_PROVIDER_CATALOG
from app.models.billing import BillingCatalogRevision
from app.models.user import User


class CatalogUnavailableError(RuntimeError):
    pass


class CatalogPublicationConflict(RuntimeError):
    pass


class PricePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    currency: Literal["USD"]
    amount_minor: int = Field(ge=0)
    tax_behavior: Literal["inclusive"]
    provider_price_ref: str = ""


class RegionalPricePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    currency: Literal["USD", "INR"]
    amount_minor: int = Field(ge=100)
    tax_behavior: Literal["inclusive", "exclusive"]
    tax_minor: int = Field(ge=0)
    provider_price_ref: str = ""
    provider_mode: Literal["test", "live"]
    provider_plan_name: str = Field(min_length=1, max_length=255)
    interval: Literal[1] = 1
    period: Literal["monthly"] = "monthly"
    fx_inr_per_usd: str
    tax_rate: str
    metadata: str
    tax_verified: bool = False

    @model_validator(mode="after")
    def consistent_tax(self) -> RegionalPricePayload:
        if self.tax_behavior == "inclusive" and self.tax_minor:
            raise ValueError("Inclusive prices cannot add a separate tax amount")
        return self


def _validate_regional_price(
    price: RegionalPricePayload, region: str, usd_minor: int
) -> None:
    """Regional amounts must follow the published catalog currency rule.

    International prices are the canonical USD amount. India prices are the
    GST-exclusive INR derived once from the recorded authoring rate, with the
    frozen GST amount the provider plan will collect on top.
    """
    if region == "international":
        if price.amount_minor != usd_minor or price.tax_minor:
            raise ValueError("International price must equal the USD catalog price")
        return
    try:
        rate = Decimal(price.fx_inr_per_usd)
        tax_rate = Decimal(price.tax_rate)
        expected = inr_minor_from_usd_minor(usd_minor, rate)
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("Invalid INR authoring rate") from exc
    if price.tax_behavior != "exclusive" or not Decimal(0) <= tax_rate <= 1:
        raise ValueError("India prices are GST-exclusive with a valid GST rate")
    tax = int(
        (Decimal(expected) * tax_rate).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    )
    if (price.amount_minor, price.tax_minor) != (expected, tax):
        raise ValueError("India price does not follow the catalog currency rule")


class GrantPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    key: str
    value: int = Field(ge=0)

    @model_validator(mode="after")
    def valid_capability(self) -> GrantPayload:
        try:
            definition = CAPABILITY_REGISTRY.require(self.key)
        except KeyError as exc:
            raise ValueError(f"unknown capability: {self.key!r}") from exc
        if not definition.issuable:
            raise ValueError(f"capability {self.key!r} is non-issuable")
        return self


class PlanPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    key: Literal["tier_1", "tier_2", "tier_3", "enterprise"]
    name: str
    description: str
    cadence: Literal["monthly", "custom"]
    self_serve: bool
    contact_only: bool
    byok_price: PricePayload | None
    funded_price: PricePayload | None
    regional_byok_prices: dict[str, RegionalPricePayload] = Field(default_factory=dict)
    grants: tuple[GrantPayload, ...]

    @model_validator(mode="after")
    def regional_terms(self) -> PlanPayload:
        for region, price in self.regional_byok_prices.items():
            if region not in {"india", "international"}:
                raise ValueError("Unknown billing region")
            if price.currency != ("INR" if region == "india" else "USD"):
                raise ValueError("Regional currency mismatch")
            if self.contact_only or self.byok_price is None:
                raise ValueError("Contact-only plans cannot have regional prices")
            _validate_regional_price(price, region, self.byok_price.amount_minor)
        return self

    @model_validator(mode="after")
    def valid_shape(self) -> PlanPayload:
        if self.contact_only and (
            self.self_serve or self.byok_price or self.funded_price or self.grants
        ):
            raise ValueError("contact-only plans carry no prices or grants")
        if not self.contact_only and self.byok_price is None:
            raise ValueError("self-serve plan requires a BYOK price")
        if len({grant.key for grant in self.grants}) != len(self.grants):
            raise ValueError("plan capability keys must be unique")
        return self

    @model_validator(mode="after")
    def funded_not_below_byok(self) -> PlanPayload:
        byok, funded = self.byok_price, self.funded_price
        if byok and funded and funded.amount_minor < byok.amount_minor:
            raise ValueError("funded price cannot be below the BYOK price")
        return self


class AiCreditRatePayload(BaseModel):
    """One explicit finite credit rate for an exact app-model route."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    feature: Literal["agent"]
    model: str = Field(min_length=1, max_length=255)
    input_credits_per_million: int = Field(ge=0)
    cached_input_credits_per_million: int = Field(ge=0)
    output_credits_per_million: int = Field(ge=0)
    reasoning_credits_per_million: int = Field(ge=0)
    call_credit_cap: int = Field(gt=0)
    unknown_usage_charge: int = Field(gt=0)

    @model_validator(mode="after")
    def bounded_unknown_usage(self) -> AiCreditRatePayload:
        if self.unknown_usage_charge > self.call_credit_cap:
            raise ValueError("unknown usage charge must not exceed the call cap")
        if not any(
            (
                self.input_credits_per_million,
                self.cached_input_credits_per_million,
                self.output_credits_per_million,
                self.reasoning_credits_per_million,
            )
        ):
            raise ValueError("AI-credit policy requires at least one positive rate")
        return self

    def charge(self, usage: dict[str, int]) -> int | None:
        input_tokens = usage.get("input_tokens", usage.get("prompt_tokens"))
        output_tokens = usage.get("output_tokens", usage.get("completion_tokens"))
        if not isinstance(input_tokens, int) or not isinstance(output_tokens, int):
            return None
        cached = usage.get("cached_input_tokens", 0)
        reasoning = usage.get("reasoning_tokens", 0)
        if not isinstance(cached, int) or not isinstance(reasoning, int):
            return None
        uncached = max(input_tokens - cached, 0)
        numerator = (
            uncached * self.input_credits_per_million
            + cached * self.cached_input_credits_per_million
            + output_tokens * self.output_credits_per_million
            + reasoning * self.reasoning_credits_per_million
        )
        return min(max(1, ceil(numerator / 1_000_000)), self.call_credit_cap)


class AiCreditPolicyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    version: str = Field(min_length=1, max_length=64)
    rates: tuple[AiCreditRatePayload, ...]

    @model_validator(mode="after")
    def unique_routes(self) -> AiCreditPolicyPayload:
        keys = {(rate.feature, rate.model) for rate in self.rates}
        if len(keys) != len(self.rates):
            raise ValueError("AI-credit policy route identities must be unique")
        return self

    def rate(self, *, feature: str, model: str) -> AiCreditRatePayload | None:
        return next(
            (
                rate
                for rate in self.rates
                if rate.feature == feature and rate.model == model
            ),
            None,
        )


class CampaignPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    key: Literal["no_card_tier_1_intro"]
    state: Literal["draft", "enabled", "ended"]
    enabled: bool
    duration_days: Literal[7]
    plan_key: Literal["tier_1"]
    claim_available: bool
    cohort_started_at: datetime | None = None
    ends_at: datetime | None = None
    eligibility_policy: Literal["new_account", "oauth_verified_work_email"] = (
        "new_account"
    )
    operator_code_allowed: bool = True

    @model_validator(mode="after")
    def valid_campaign_lifecycle(self) -> CampaignPayload:
        active = self.state == "enabled"
        if self.enabled != active or self.claim_available != active:
            raise ValueError("campaign enablement fields must move together")
        if active and self.cohort_started_at is None:
            raise ValueError("enabled campaign requires cohort start")
        if self.ends_at is not None and (
            self.cohort_started_at is None or self.ends_at <= self.cohort_started_at
        ):
            raise ValueError("campaign end must follow cohort start")
        return self


def _plans_by_key(plans: tuple[PlanPayload, ...]) -> dict[str, PlanPayload]:
    expected = {PLAN_TIER_1, PLAN_TIER_2, PLAN_TIER_3, PLAN_ENTERPRISE}
    by_key: dict[str, PlanPayload] = {plan.key: plan for plan in plans}
    if set(by_key) != expected or len(plans) != len(expected):
        raise ValueError("catalog must contain Tier 1/2/3 and Enterprise exactly once")
    return by_key


def _validate_agent_capabilities(by_key: dict[str, PlanPayload]) -> None:
    tier_1_keys = {grant.key for grant in by_key[PLAN_TIER_1].grants}
    if KEY_AGENT in tier_1_keys:
        raise ValueError("Tier 1 cannot grant the Agent")
    for key in (PLAN_TIER_2, PLAN_TIER_3):
        upper_keys = {grant.key for grant in by_key[key].grants}
        if KEY_AGENT not in upper_keys:
            raise ValueError(f"{key} must grant the Agent")


def _validate_platform_routes(routes: tuple[dict[str, str], ...]) -> None:
    expected_fields = {
        "logical_engine",
        "transport_provider",
        "model",
        "credential_ref",
    }
    secret_tokens = ("secret", "password", "api_key")
    for route in routes:
        if set(route) != expected_fields:
            raise ValueError("platform route metadata has an invalid shape")
        if any(token in key.lower() for key in route for token in secret_tokens):
            raise ValueError("platform route metadata cannot contain secret fields")
        reference = route["credential_ref"].strip().lower()
        if not reference or any(
            token in reference for token in ("sk-", "secret", "password")
        ):
            raise ValueError("platform route credential reference is invalid")


class ItemPricePayload(BaseModel):
    """One regional one-time price. One-time charges need no provider plan."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    currency: Literal["USD", "INR"]
    amount_minor: int = Field(ge=100)
    tax_behavior: Literal["inclusive", "exclusive"]
    fx_inr_per_usd: str = ""


class ItemModeTermsPayload(BaseModel):
    """Price and per-unit grants of one item for one credential mode."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    usd_minor: int = Field(ge=100)
    regional_prices: dict[Literal["india", "international"], ItemPricePayload]
    grants: tuple[GrantPayload, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def regional_terms(self) -> ItemModeTermsPayload:
        if len({grant.key for grant in self.grants}) != len(self.grants):
            raise ValueError("item capability keys must be unique")
        for region, price in self.regional_prices.items():
            if region == "international":
                if (price.currency, price.tax_behavior, price.amount_minor) != (
                    "USD",
                    "inclusive",
                    self.usd_minor,
                ):
                    raise ValueError("International price must equal the USD price")
                continue
            try:
                expected = inr_minor_from_usd_minor(
                    self.usd_minor, Decimal(price.fx_inr_per_usd)
                )
            except (InvalidOperation, ValueError) as exc:
                raise ValueError("Invalid INR authoring rate") from exc
            if (price.currency, price.tax_behavior, price.amount_minor) != (
                "INR",
                "exclusive",
                expected,
            ):
                raise ValueError("India price does not follow the catalog rule")
        return self


class CatalogItemPayload(BaseModel):
    """One one-time add-on or top-up.

    Every item is bought once and expires ``expiry_days`` after purchase or at
    the end of the paid subscription, whichever is earlier. ``available`` is
    the operator's sell switch for an item whose terms are published but whose
    fulfilment is not yet ready.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)
    key: str = Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(max_length=255)
    available: bool
    eligible_plan_keys: tuple[Literal["tier_1", "tier_2", "tier_3"], ...] = Field(
        min_length=1
    )
    quantity_min: int = Field(ge=1)
    quantity_max: int = Field(ge=1, le=100)
    expiry_days: int = Field(gt=0, le=366)
    modes: dict[Literal["byok", "funded"], ItemModeTermsPayload]

    @model_validator(mode="after")
    def valid_item(self) -> CatalogItemPayload:
        if self.quantity_min > self.quantity_max:
            raise ValueError("item quantity bounds are inverted")
        if "byok" not in self.modes:
            raise ValueError("item requires BYOK terms")
        if len(set(self.eligible_plan_keys)) != len(self.eligible_plan_keys):
            raise ValueError("item eligible plans must be unique")
        return self


class SupportContactPayload(BaseModel):
    """Public support identity shown on pricing, billing and documents."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    email: str = Field(pattern=r"^[^@\s]+@[^@.\s]+(?:\.[^@.\s]+)+$", max_length=254)
    phone: str = Field(default="", max_length=32)
    contact_url: str = Field(pattern=r"^https://", max_length=255)


def _validate_items(
    addons: tuple[CatalogItemPayload, ...], topups: tuple[CatalogItemPayload, ...]
) -> None:
    keys = [item.key for item in (*addons, *topups)]
    if len(keys) != len(set(keys)):
        raise ValueError("add-on and top-up keys must be unique")
    for topup in topups:
        for terms in topup.modes.values():
            for grant in terms.grants:
                definition = CAPABILITY_REGISTRY.require(grant.key)
                if definition.capability_type is not CapabilityType.COUNTER_CONSUMABLE:
                    raise ValueError("top-ups may only grant consumable credits")


def _validate_provider_plans(plans: tuple[PlanPayload, ...]) -> None:
    """One provider plan per (plan, region): a plan ref is never shared.

    A provider plan is an immutable artifact with one amount and currency, so
    two catalog prices naming the same ref would charge one of them the
    other's amount.
    """
    refs = [
        price.provider_price_ref
        for plan in plans
        for price in plan.regional_byok_prices.values()
        if price.provider_price_ref
    ]
    if len(refs) != len(set(refs)):
        raise ValueError("each provider plan reference may price only one SKU")


class CatalogPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    schema_version: Literal[1]
    plans: tuple[PlanPayload, ...]
    campaign: CampaignPayload
    contact_sales_url: str
    platform_routes: tuple[dict[str, str], ...]
    ai_credit_policy: AiCreditPolicyPayload | None = None
    addons: tuple[CatalogItemPayload, ...] = ()
    topups: tuple[CatalogItemPayload, ...] = ()
    support_contact: SupportContactPayload | None = None

    @model_validator(mode="after")
    def valid_catalog(self) -> CatalogPayload:
        by_key = _plans_by_key(self.plans)
        _validate_agent_capabilities(by_key)
        _validate_platform_routes(self.platform_routes)
        _validate_items(self.addons, self.topups)
        _validate_provider_plans(self.plans)
        if self.campaign.enabled and not by_key[self.campaign.plan_key].grants:
            raise ValueError("enabled campaign plan requires a grant bundle")
        return self


def validate_payload(payload: dict[str, object]) -> CatalogPayload:
    return CatalogPayload.model_validate(payload)


def payload_digest(payload: CatalogPayload) -> str:
    encoded = json.dumps(
        payload.model_dump(mode="json"), sort_keys=True, separators=(",", ":")
    ).encode()
    return hashlib.sha256(encoded).hexdigest()


def _require_admin(actor: User) -> None:
    if not actor.is_active or actor.role != "admin":
        raise PermissionError("active_admin_required")


async def create_draft(
    session: AsyncSession,
    *,
    revision: str,
    payload: dict[str, object],
    actor: User,
    reason: str,
) -> BillingCatalogRevision:
    _require_admin(actor)
    if not reason.strip() or len(reason) > 255:
        raise ValueError("reason_required")
    parsed = validate_payload(payload)
    row = BillingCatalogRevision(
        revision=revision,
        payload=parsed.model_dump(mode="json"),
        payload_sha256=payload_digest(parsed),
        publication_state="draft",
        created_by_user_id=actor.id,
        created_reason=reason.strip(),
    )
    session.add(row)
    await session.flush()
    return row


async def publish_revision(
    session: AsyncSession,
    *,
    revision: str,
    actor: User,
    reason: str,
    at: datetime | None = None,
) -> BillingCatalogRevision:
    _require_admin(actor)
    if not reason.strip() or len(reason) > 255:
        raise ValueError("reason_required")
    row = await session.scalar(
        select(BillingCatalogRevision)
        .where(BillingCatalogRevision.revision == revision)
        .with_for_update()
    )
    if row is None:
        raise CatalogUnavailableError("catalog_revision_not_found")
    validate_payload(row.payload)
    if row.publication_state == "published":
        return row
    await session.execute(
        update(BillingCatalogRevision)
        .where(BillingCatalogRevision.publication_state == "published")
        .values(publication_state="retired")
    )
    row.publication_state = "published"
    row.published_by_user_id = actor.id
    row.published_reason = reason.strip()
    row.published_at = at or datetime.now(UTC)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise CatalogPublicationConflict("catalog_publication_conflict") from exc
    return row


async def catalog_revision(
    session: AsyncSession, revision: str
) -> BillingCatalogRevision:
    row = await session.scalar(
        select(BillingCatalogRevision).where(
            BillingCatalogRevision.revision == revision
        )
    )
    if row is None:
        raise CatalogUnavailableError("catalog_revision_not_found")
    validate_payload(row.payload)
    return row


async def published_revision(session: AsyncSession) -> BillingCatalogRevision:
    row = await session.scalar(
        select(BillingCatalogRevision).where(
            BillingCatalogRevision.publication_state == "published"
        )
    )
    if row is None:
        raise CatalogUnavailableError("catalog_unavailable")
    validate_payload(row.payload)
    return row


def grant_specs_from_row(
    row: BillingCatalogRevision, catalog_key: str
) -> tuple[tuple[str, int], ...] | None:
    catalog = commercial_catalog_from_row(row)
    plan = catalog.plan(catalog_key)
    if plan is None or not plan.grant_bundle:
        return None
    return tuple((grant.key, grant.value) for grant in plan.grant_bundle)


def item_terms_from_row(
    row: BillingCatalogRevision, catalog_key: str
) -> tuple[tuple[tuple[str, int], ...], int, tuple[str, ...]] | None:
    """Per-unit grants, expiry days and eligible plans of one add-on/top-up.

    Read from the purchase's FROZEN revision, so a later publication never
    changes what an earlier purchase grants.
    """
    catalog = commercial_catalog_from_row(row)
    item = catalog.addon(catalog_key) or catalog.topup(catalog_key)
    if item is None or not item.grant_bundle_per_unit:
        return None
    specs = tuple((grant.key, grant.value) for grant in item.grant_bundle_per_unit)
    return specs, item.expiry_days, item.eligible_plan_keys


async def published_ai_credit_policy(
    session: AsyncSession,
) -> tuple[str, AiCreditPolicyPayload]:
    """Return the explicit published policy, never a runtime/default rate."""
    row = await published_revision(session)
    policy = validate_payload(row.payload).ai_credit_policy
    if policy is None or not policy.rates:
        raise CatalogUnavailableError("ai_credit_policy_unavailable")
    return row.revision, policy


async def ai_credit_policy_for_revision(
    session: AsyncSession, revision: str
) -> AiCreditPolicyPayload:
    """Load the immutable policy frozen when paid work was admitted."""
    row = await catalog_revision(session, revision)
    policy = validate_payload(row.payload).ai_credit_policy
    if policy is None or not policy.rates:
        raise CatalogUnavailableError("ai_credit_policy_unavailable")
    return policy


async def published_commercial_catalog(
    session: AsyncSession,
) -> CommercialCatalog:
    """Load the sole published catalog or fail closed."""
    return commercial_catalog_from_row(await published_revision(session))


def commercial_catalog_from_row(row: BillingCatalogRevision) -> CommercialCatalog:
    payload = validate_payload(row.payload)
    plans: list[PlanCatalogEntry] = []
    for item in payload.plans:
        base = item.byok_price
        funded = item.funded_price
        base_prices = (
            {"international": CatalogPrice(**base.model_dump())} if base else {}
        )
        for region, price in item.regional_byok_prices.items():
            base_prices[region] = CatalogPrice(
                currency=price.currency,
                amount_minor=price.amount_minor,
                tax_behavior=price.tax_behavior,
                provider_price_ref=price.provider_price_ref,
                frozen_tax_minor=price.tax_minor,
                provider_mode=price.provider_mode,
                synthetic=price.metadata == "sandbox-fixture-not-for-production",
                tax_verified=price.tax_verified,
            )
        credit_prices = {}
        if base and funded:
            credit = funded.amount_minor - base.amount_minor
            if credit < 0:
                raise ValueError("funded price cannot be below BYOK price")
            credit_prices = {
                CADENCE_MONTHLY: {
                    "international": CatalogPrice(
                        currency="USD",
                        amount_minor=credit,
                        tax_behavior=TAX_BEHAVIOR_INCLUSIVE,
                        provider_price_ref=funded.provider_price_ref,
                    )
                }
            }
        plans.append(
            PlanCatalogEntry(
                key=item.key,
                name=item.name,
                description=item.description,
                cadence=item.cadence,
                base_prices=base_prices,
                credit_prices_by_cadence=credit_prices,
                grant_bundle=tuple(
                    GrantTemplate(key=g.key, value=g.value) for g in item.grants
                ),
                trial_availability="unavailable",
                trial_unavailable_reason=REASON_CONTACT_ONLY
                if item.contact_only
                else REASON_TRIAL_UNAVAILABLE,
                self_serve=item.self_serve,
                contact_only=item.contact_only,
            )
        )
    return CommercialCatalog(
        revision=row.revision,
        plans=tuple(plans),
        addons=tuple(_addon_entry(item) for item in payload.addons),
        topups=tuple(_topup_entry(item) for item in payload.topups),
        providers=PUBLIC_PROVIDER_CATALOG,
    )


# Launch checkout is BYOK-only: runtime entries carry the BYOK terms, while the
# payload keeps the funded terms for a later funded release.
_ITEM_MODE: Literal["byok"] = "byok"


def _item_parts(
    item: CatalogItemPayload,
) -> tuple[dict[str, CatalogPrice], tuple[GrantTemplate, ...], str, str | None]:
    terms = item.modes[_ITEM_MODE]
    prices: dict[str, CatalogPrice] = {
        region: CatalogPrice(
            currency=price.currency,
            amount_minor=price.amount_minor,
            tax_behavior=price.tax_behavior,
            provider_price_ref="",
            one_time=True,
        )
        for region, price in terms.regional_prices.items()
    }
    grants = tuple(GrantTemplate(key=g.key, value=g.value) for g in terms.grants)
    if item.available and prices:
        return prices, grants, "available", None
    return prices, grants, "unavailable", REASON_CHECKOUT_UNAVAILABLE


def _addon_entry(item: CatalogItemPayload) -> AddonCatalogEntry:
    prices, grants, availability, reason = _item_parts(item)
    return AddonCatalogEntry(
        key=item.key,
        name=item.name,
        description=item.description,
        quantity_bounds=QuantityBounds(item.quantity_min, item.quantity_max),
        prices=prices,
        grant_bundle_per_unit=grants,
        availability=availability,
        unavailable_reason=reason,
        eligible_plan_keys=item.eligible_plan_keys,
        expiry_days=item.expiry_days,
    )


def _topup_entry(item: CatalogItemPayload) -> TopupCatalogEntry:
    prices, grants, availability, reason = _item_parts(item)
    return TopupCatalogEntry(
        key=item.key,
        name=item.name,
        description=item.description,
        quantity_bounds=QuantityBounds(item.quantity_min, item.quantity_max),
        prices=prices,
        grant_bundle_per_unit=grants,
        availability=availability,
        unavailable_reason=reason,
        expiry_days=item.expiry_days,
        eligible_plan_keys=item.eligible_plan_keys,
    )
