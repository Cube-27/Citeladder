"""Persisted immutable commercial catalog validation and publication."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from math import ceil
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.billing_catalog import (
    CatalogPrice,
    CommercialCatalog,
    GrantTemplate,
    PlanCatalogEntry,
)
from app.core.config.billing_contracts import (
    CADENCE_MONTHLY,
    PLAN_ENTERPRISE,
    PLAN_TIER_1,
    PLAN_TIER_2,
    PLAN_TIER_3,
    REASON_CONTACT_ONLY,
    REASON_TRIAL_UNAVAILABLE,
    TAX_BEHAVIOR_INCLUSIVE,
)
from app.core.config.entitlements import (
    CAPABILITY_REGISTRY,
    KEY_AUDIT_CADENCE,
    KEY_CONTENT_CREATION,
    KEY_EXPORTS,
    KEY_FANOUT,
    KEY_GROWTH_AGENT,
    KEY_HISTORY_WINDOW,
    KEY_MANUAL_RUNS_PER_DAY,
    KEY_MONITORED_URLS,
    KEY_PROJECT_SLOTS,
    KEY_PROMPT_SLOTS,
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


def _validate_sandbox_price(
    price: RegionalPricePayload, region: str, base: int
) -> None:
    from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

    if price.provider_mode != "test":
        raise ValueError("Synthetic prices cannot be live")
    expected, tax = base, 0
    if region == "india":
        try:
            expected = int(
                (Decimal(base) * Decimal(price.fx_inr_per_usd)).quantize(
                    Decimal("1"), rounding=ROUND_HALF_UP
                )
            )
            tax = int(
                (Decimal(expected) * Decimal(price.tax_rate)).quantize(
                    Decimal("1"), rounding=ROUND_HALF_UP
                )
            )
        except (InvalidOperation, ValueError, OverflowError) as exc:
            raise ValueError("Invalid sandbox FX or tax rate") from exc
    if (price.amount_minor, price.tax_minor) != (expected, tax):
        raise ValueError("Sandbox price rounding mismatch")


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
            if price.metadata == "sandbox-fixture-not-for-production":
                _validate_sandbox_price(price, region, self.byok_price.amount_minor)
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


class AiCreditRatePayload(BaseModel):
    """One explicit finite credit rate for an exact app-model route."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    feature: Literal["content", "growth_agent"]
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


def _validate_approved_plan_terms(by_key: dict[str, PlanPayload]) -> None:
    approved_prices = {
        PLAN_TIER_1: (4_900, 9_900),
        PLAN_TIER_2: (9_900, 14_900),
        PLAN_TIER_3: (14_900, 29_900),
    }
    for key, amounts in approved_prices.items():
        plan = by_key[key]
        actual = (
            plan.byok_price.amount_minor if plan.byok_price else None,
            plan.funded_price.amount_minor if plan.funded_price else None,
        )
        if actual != amounts:
            raise ValueError(f"{key} prices differ from approved terms")


def _validate_agent_capabilities(by_key: dict[str, PlanPayload]) -> None:
    required_upper = {KEY_CONTENT_CREATION, KEY_GROWTH_AGENT}
    tier_1_keys = {grant.key for grant in by_key[PLAN_TIER_1].grants}
    if required_upper & tier_1_keys:
        raise ValueError("Tier 1 cannot grant Content or Growth Agent")
    for key in (PLAN_TIER_2, PLAN_TIER_3):
        upper_keys = {grant.key for grant in by_key[key].grants}
        if not required_upper.issubset(upper_keys):
            raise ValueError(f"{key} must grant Content and Growth Agent")


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


class CatalogPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    schema_version: Literal[1]
    plans: tuple[PlanPayload, ...]
    campaign: CampaignPayload
    contact_sales_url: str
    platform_routes: tuple[dict[str, str], ...]
    ai_credit_policy: AiCreditPolicyPayload | None = None

    @model_validator(mode="after")
    def valid_catalog(self) -> CatalogPayload:
        by_key = _plans_by_key(self.plans)
        _validate_approved_plan_terms(by_key)
        _validate_agent_capabilities(by_key)
        _validate_platform_routes(self.platform_routes)
        if self.campaign.enabled and not by_key[self.campaign.plan_key].grants:
            raise ValueError("enabled campaign plan requires a grant bundle")
        return self


def _level(key: str, value: str) -> int:
    return CAPABILITY_REGISTRY.require(key).ordered_values.index(value)


def _grants(
    *, projects: int, prompts: int, urls: int, history: str, runs: int, upper: bool
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = [
        {
            "key": KEY_AUDIT_CADENCE,
            "value": _level(KEY_AUDIT_CADENCE, "daily" if upper else "weekly"),
        },
        {"key": KEY_PROJECT_SLOTS, "value": projects},
        {"key": KEY_PROMPT_SLOTS, "value": prompts},
        {"key": KEY_MONITORED_URLS, "value": urls},
        {"key": KEY_HISTORY_WINDOW, "value": _level(KEY_HISTORY_WINDOW, history)},
        {"key": KEY_MANUAL_RUNS_PER_DAY, "value": runs},
        {"key": KEY_EXPORTS, "value": 1},
    ]
    if upper:
        rows.extend(
            (
                {"key": KEY_FANOUT, "value": 1},
                {"key": KEY_CONTENT_CREATION, "value": 1},
                {"key": KEY_GROWTH_AGENT, "value": 1},
            )
        )
    return rows


def approved_phase1_payload() -> dict[str, object]:
    """Approved terms only; checkout and the no-card campaign remain disabled."""

    def price(amount: int) -> dict[str, object]:
        return {
            "currency": "USD",
            "amount_minor": amount,
            "tax_behavior": "inclusive",
            "provider_price_ref": "",
        }

    plans = (
        (
            PLAN_TIER_1,
            "Tier 1",
            4_900,
            9_900,
            _grants(
                projects=1, prompts=10, urls=50, history="90d", runs=3, upper=False
            ),
        ),
        (
            PLAN_TIER_2,
            "Tier 2",
            9_900,
            14_900,
            _grants(
                projects=3, prompts=30, urls=150, history="12mo", runs=6, upper=True
            ),
        ),
        (
            PLAN_TIER_3,
            "Tier 3",
            14_900,
            29_900,
            _grants(
                projects=10, prompts=60, urls=400, history="24mo", runs=12, upper=True
            ),
        ),
    )
    return {
        "schema_version": 1,
        "plans": [
            {
                "key": key,
                "name": name,
                "description": f"Approved {name} monthly terms.",
                "cadence": "monthly",
                "self_serve": True,
                "contact_only": False,
                "byok_price": price(byok),
                "funded_price": price(funded),
                "grants": grants,
            }
            for key, name, byok, funded, grants in plans
        ]
        + [
            {
                "key": PLAN_ENTERPRISE,
                "name": "Enterprise",
                "description": (
                    "Custom volume, security review, and deployment options."
                ),
                "cadence": "custom",
                "self_serve": False,
                "contact_only": True,
                "byok_price": None,
                "funded_price": None,
                "grants": [],
            }
        ],
        "campaign": {
            "key": "no_card_tier_1_intro",
            "state": "draft",
            "enabled": False,
            "duration_days": 7,
            "plan_key": "tier_1",
            "claim_available": False,
            "cohort_started_at": None,
            "ends_at": None,
            "eligibility_policy": "new_account",
            "operator_code_allowed": True,
        },
        "contact_sales_url": "https://www.cube27.com/contact/",
        "platform_routes": [],
        "ai_credit_policy": None,
    }


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


async def seed_phase1_draft(
    session: AsyncSession,
    *,
    actor: User,
    reason: str,
    revision: str = "commercial-phase1-v1",
) -> BillingCatalogRevision:
    existing = await session.scalar(
        select(BillingCatalogRevision).where(
            BillingCatalogRevision.revision == revision
        )
    )
    if existing is not None:
        validate_payload(existing.payload)
        return existing
    return await create_draft(
        session,
        revision=revision,
        payload=approved_phase1_payload(),
        actor=actor,
        reason=reason,
    )


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
        addons=(),
        topups=(),
        providers=PUBLIC_PROVIDER_CATALOG,
    )
