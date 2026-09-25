"""Author the ``launch-pricing-v1`` catalog revision.

Terms come from ``docs/operations/CiteLadder_Launch_Config.md``.

This module only AUTHORS a draft payload. The persisted, validated and
published ``BillingCatalogRevision`` stays the runtime commercial authority.

Authoring freezes every regional amount: USD is the canonical price, the INR
price is derived once through ``billing_pricing.inr_minor_from_usd_minor`` at
the recorded rate, and the India GST amount a recurring provider plan collects
is frozen from the APPROVED rate. Regional (checkout-capable) prices are only
authored for a named provider environment; without one, or without an
approved GST rate for India, that region is simply absent and its checkout
fails closed.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Final, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.billing_contracts import (
    ADDON_EXTRA_PROJECT,
    ADDON_EXTRA_PROMPTS,
    ADDON_EXTRA_SITE_HEALTH,
    ADDON_QUANTITY_MAX,
    ADDON_QUANTITY_MIN,
    PLAN_ENTERPRISE,
    PLAN_TIER_1,
    PLAN_TIER_2,
    PLAN_TIER_3,
    TOPUP_AI_CREDITS,
    TOPUP_AUDIT_CREDITS,
    TOPUP_QUANTITY_MAX,
    TOPUP_QUANTITY_MIN,
)
from app.core.config.billing_pricing import (
    AUTHORING_USD_INR_RATE,
    inr_minor_from_usd_minor,
)
from app.core.config.billing_tax import TaxPolicyError, approved_india_gst_rate
from app.core.config.entitlements import (
    CAPABILITY_REGISTRY,
    KEY_AI_CREDITS,
    KEY_AUDIT_CADENCE,
    KEY_AUDIT_CREDITS,
    KEY_CONTENT_CREATION,
    KEY_EXPORTS,
    KEY_FANOUT,
    KEY_GROWTH_AGENT,
    KEY_HISTORY_WINDOW,
    KEY_MANUAL_RUNS_PER_DAY,
    KEY_MONITORED_URLS,
    KEY_PROJECT_SLOTS,
    KEY_PROMPT_SLOTS,
    KEY_SITE_HEALTH_PAGE_FETCHES,
    KEY_SUPPORT_TIER,
)
from app.domain.billing.catalog_revisions import create_draft, validate_payload
from app.models.billing import BillingCatalogRevision
from app.models.user import User

LAUNCH_REVISION: Final = "launch-pricing-v1"
ProviderMode = Literal["test", "live"]

_ITEM_EXPIRY_DAYS: Final = 30
_SUPPORT_EMAIL: Final = "contact@cube27.com"
_CONTACT_URL: Final = "https://www.cube27.com/contact/"


@dataclass(frozen=True, slots=True)
class _PlanTerms:
    key: str
    name: str
    description: str
    byok_usd_minor: int
    funded_usd_minor: int
    projects: int
    prompts: int
    monitored_urls: int
    page_fetches: int
    history: str
    manual_runs_per_day: int
    ai_credits: int
    upper: bool
    support: str


_PLANS: Final = (
    _PlanTerms(
        key=PLAN_TIER_1,
        name="Starter",
        description="Daily AI visibility tracking for one project.",
        byok_usd_minor=4_900,
        funded_usd_minor=9_900,
        projects=1,
        prompts=10,
        monitored_urls=50,
        page_fetches=500,
        history="90d",
        manual_runs_per_day=3,
        ai_credits=0,
        upper=False,
        support="standard",
    ),
    _PlanTerms(
        key=PLAN_TIER_2,
        name="Growth",
        description="Prompt fan-out and the Agent for three projects.",
        byok_usd_minor=9_900,
        funded_usd_minor=24_900,
        projects=3,
        prompts=30,
        monitored_urls=150,
        page_fetches=1_500,
        history="12mo",
        manual_runs_per_day=6,
        ai_credits=500,
        upper=True,
        support="standard",
    ),
    _PlanTerms(
        key=PLAN_TIER_3,
        name="Scale",
        description="Ten projects, two years of history and priority support.",
        byok_usd_minor=19_900,
        funded_usd_minor=49_900,
        projects=10,
        prompts=60,
        monitored_urls=400,
        page_fetches=4_000,
        history="24mo",
        manual_runs_per_day=12,
        ai_credits=1_500,
        upper=True,
        support="priority",
    ),
)


def _level(key: str, value: str) -> int:
    return CAPABILITY_REGISTRY.require(key).ordered_values.index(value)


def _grant(key: str, value: int) -> dict[str, object]:
    return {"key": key, "value": value}


def _plan_grants(plan: _PlanTerms) -> list[dict[str, object]]:
    """One plan's period bundle.

    ``audit_cadence`` is how often audits RUN (daily on every paid plan). It is
    not the billing period: every recurring provider plan bills monthly.
    BYOK plans include no managed visibility answers, so no ``audit_credits``.
    """
    rows = [
        _grant(KEY_AUDIT_CADENCE, _level(KEY_AUDIT_CADENCE, "daily")),
        _grant(KEY_PROJECT_SLOTS, plan.projects),
        _grant(KEY_PROMPT_SLOTS, plan.prompts),
        _grant(KEY_MONITORED_URLS, plan.monitored_urls),
        _grant(KEY_SITE_HEALTH_PAGE_FETCHES, plan.page_fetches),
        _grant(KEY_HISTORY_WINDOW, _level(KEY_HISTORY_WINDOW, plan.history)),
        _grant(KEY_MANUAL_RUNS_PER_DAY, plan.manual_runs_per_day),
        _grant(KEY_EXPORTS, 1),
        _grant(KEY_SUPPORT_TIER, _level(KEY_SUPPORT_TIER, plan.support)),
    ]
    if plan.ai_credits:
        rows.append(_grant(KEY_AI_CREDITS, plan.ai_credits))
    if plan.upper:
        rows.extend(
            (
                _grant(KEY_FANOUT, 1),
                _grant(KEY_CONTENT_CREATION, 1),
                _grant(KEY_GROWTH_AGENT, 1),
            )
        )
    return rows


def _gst_minor(amount_minor: int, rate: Decimal) -> int:
    return int((Decimal(amount_minor) * rate).quantize(Decimal("1"), ROUND_HALF_UP))


def _usd_price(amount_minor: int) -> dict[str, object]:
    return {
        "currency": "USD",
        "amount_minor": amount_minor,
        "tax_behavior": "inclusive",
        "provider_price_ref": "",
    }


def _regional_plan_prices(
    *,
    name: str,
    usd_minor: int,
    provider_mode: ProviderMode | None,
    rate: Decimal,
    gst_rate: Decimal | None,
    tax_verified: bool,
) -> dict[str, object]:
    """Checkout-capable BYOK prices, one per region the environment can sell."""
    if provider_mode is None:
        return {}
    common = {
        "provider_price_ref": "",
        "provider_mode": provider_mode,
        "interval": 1,
        "period": "monthly",
        "fx_inr_per_usd": str(rate),
        "metadata": LAUNCH_REVISION,
    }
    prices: dict[str, object] = {
        "international": {
            **common,
            "currency": "USD",
            "amount_minor": usd_minor,
            "tax_behavior": "inclusive",
            "tax_minor": 0,
            "provider_plan_name": f"CiteLadder {name} BYOK USD",
            "tax_rate": "0",
            "tax_verified": True,
        }
    }
    if gst_rate is not None:
        inr_minor = inr_minor_from_usd_minor(usd_minor, rate)
        prices["india"] = {
            **common,
            "currency": "INR",
            "amount_minor": inr_minor,
            "tax_behavior": "exclusive",
            "tax_minor": _gst_minor(inr_minor, gst_rate),
            "provider_plan_name": f"CiteLadder {name} BYOK INR",
            "tax_rate": str(gst_rate),
            "tax_verified": tax_verified,
        }
    return prices


def _item_terms(
    usd_minor: int, grants: list[dict[str, object]], rate: Decimal
) -> dict[str, object]:
    return {
        "usd_minor": usd_minor,
        "regional_prices": {
            "international": {
                "currency": "USD",
                "amount_minor": usd_minor,
                "tax_behavior": "inclusive",
            },
            "india": {
                "currency": "INR",
                "amount_minor": inr_minor_from_usd_minor(usd_minor, rate),
                "tax_behavior": "exclusive",
                "fx_inr_per_usd": str(rate),
            },
        },
        "grants": grants,
    }


def _item(
    *,
    key: str,
    name: str,
    description: str,
    available: bool,
    eligible: tuple[str, ...],
    bounds: tuple[int, int],
    byok: tuple[int, list[dict[str, object]]],
    funded: tuple[int, list[dict[str, object]]],
    rate: Decimal,
) -> dict[str, object]:
    return {
        "key": key,
        "name": name,
        "description": description,
        "available": available,
        "eligible_plan_keys": list(eligible),
        "quantity_min": bounds[0],
        "quantity_max": bounds[1],
        "expiry_days": _ITEM_EXPIRY_DAYS,
        "modes": {
            "byok": _item_terms(byok[0], byok[1], rate),
            "funded": _item_terms(funded[0], funded[1], rate),
        },
    }


_ALL_PAID: Final = (PLAN_TIER_1, PLAN_TIER_2, PLAN_TIER_3)
_ADDON_BOUNDS: Final = (ADDON_QUANTITY_MIN, ADDON_QUANTITY_MAX)
_TOPUP_BOUNDS: Final = (TOPUP_QUANTITY_MIN, TOPUP_QUANTITY_MAX)


def _addons(rate: Decimal) -> list[dict[str, object]]:
    project = [_grant(KEY_PROJECT_SLOTS, 1)]
    site_health = [
        _grant(KEY_MONITORED_URLS, 250),
        _grant(KEY_SITE_HEALTH_PAGE_FETCHES, 2_500),
    ]
    return [
        _item(
            key=ADDON_EXTRA_PROJECT,
            name="Extra project",
            description="One more tracked project for 30 days.",
            available=True,
            eligible=_ALL_PAID,
            bounds=_ADDON_BOUNDS,
            byok=(1_900, project),
            funded=(1_900, project),
            rate=rate,
        ),
        _item(
            key=ADDON_EXTRA_PROMPTS,
            name="Extra 10 prompts",
            description="Ten more tracked prompts for 30 days.",
            available=True,
            eligible=_ALL_PAID,
            bounds=_ADDON_BOUNDS,
            byok=(1_500, [_grant(KEY_PROMPT_SLOTS, 10)]),
            funded=(
                9_900,
                [_grant(KEY_PROMPT_SLOTS, 10), _grant(KEY_AUDIT_CREDITS, 1_000)],
            ),
            rate=rate,
        ),
        _item(
            key=ADDON_EXTRA_SITE_HEALTH,
            name="Site Health pack",
            description="250 more monitored URLs and 2,500 page fetches for 30 days.",
            available=True,
            eligible=_ALL_PAID,
            bounds=_ADDON_BOUNDS,
            byok=(1_900, site_health),
            funded=(1_900, site_health),
            rate=rate,
        ),
    ]


def _topups(rate: Decimal) -> list[dict[str, object]]:
    answers = [_grant(KEY_AUDIT_CREDITS, 1_000)]
    workflow = [_grant(KEY_AI_CREDITS, 1_000)]
    return [
        _item(
            key=TOPUP_AUDIT_CREDITS,
            name="Managed answer top-up",
            description="1,000 managed visibility answers, usable for 30 days.",
            # Published but NOT sold: managed execution needs provisioned and
            # calibrated platform routes, which the BYOK launch does not have.
            available=False,
            eligible=_ALL_PAID,
            bounds=_TOPUP_BOUNDS,
            byok=(9_900, answers),
            funded=(9_900, answers),
            rate=rate,
        ),
        _item(
            key=TOPUP_AI_CREDITS,
            name="Workflow AI top-up",
            description="1,000 AI credits for the Agent, 30 days.",
            available=True,
            eligible=(PLAN_TIER_2, PLAN_TIER_3),
            bounds=_TOPUP_BOUNDS,
            byok=(2_500, workflow),
            funded=(2_500, workflow),
            rate=rate,
        ),
    ]


def _approved_gst() -> tuple[Decimal | None, bool]:
    """The approved GST rate, or ``None`` so India stays unauthored."""
    try:
        return approved_india_gst_rate(), True
    except TaxPolicyError:
        return None, False


def launch_pricing_v1_payload(
    *,
    provider_mode: ProviderMode | None,
    usd_inr_rate: Decimal = AUTHORING_USD_INR_RATE,
) -> dict[str, object]:
    """Author the launch catalog payload for one provider environment.

    Provider plan references are left empty: they are created in the provider
    dashboard, imported into a reviewed revision and verified before
    publication. Checkout and the no-card campaign remain disabled.
    """
    gst_rate, tax_verified = _approved_gst()
    plans: list[dict[str, object]] = [
        {
            "key": plan.key,
            "name": plan.name,
            "description": plan.description,
            "cadence": "monthly",
            "self_serve": True,
            "contact_only": False,
            "byok_price": _usd_price(plan.byok_usd_minor),
            "funded_price": _usd_price(plan.funded_usd_minor),
            "regional_byok_prices": _regional_plan_prices(
                name=plan.name,
                usd_minor=plan.byok_usd_minor,
                provider_mode=provider_mode,
                rate=usd_inr_rate,
                gst_rate=gst_rate,
                tax_verified=tax_verified,
            ),
            "grants": _plan_grants(plan),
        }
        for plan in _PLANS
    ]
    plans.append(
        {
            "key": PLAN_ENTERPRISE,
            "name": "Enterprise",
            "description": "Custom volume, security review, and deployment options.",
            "cadence": "custom",
            "self_serve": False,
            "contact_only": True,
            "byok_price": None,
            "funded_price": None,
            "grants": [],
        }
    )
    return {
        "schema_version": 1,
        "plans": plans,
        "addons": _addons(usd_inr_rate),
        "topups": _topups(usd_inr_rate),
        "campaign": {
            "key": "no_card_tier_1_intro",
            "state": "draft",
            "enabled": False,
            "duration_days": 7,
            "plan_key": PLAN_TIER_1,
            "claim_available": False,
            "cohort_started_at": None,
            "ends_at": None,
            "eligibility_policy": "new_account",
            "operator_code_allowed": True,
        },
        "contact_sales_url": _CONTACT_URL,
        "support_contact": {
            "email": _SUPPORT_EMAIL,
            "phone": "",
            "contact_url": _CONTACT_URL,
        },
        "platform_routes": [],
        "ai_credit_policy": None,
    }


async def seed_launch_draft(
    session: AsyncSession,
    *,
    actor: User,
    reason: str,
    provider_mode: ProviderMode | None,
    usd_inr_rate: Decimal = AUTHORING_USD_INR_RATE,
    revision: str = LAUNCH_REVISION,
) -> BillingCatalogRevision:
    """Create the launch draft once; an existing revision is revalidated."""
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
        payload=launch_pricing_v1_payload(
            provider_mode=provider_mode, usd_inr_rate=usd_inr_rate
        ),
        actor=actor,
        reason=reason,
    )


__all__ = [
    "AUTHORING_USD_INR_RATE",
    "LAUNCH_REVISION",
    "ProviderMode",
    "launch_pricing_v1_payload",
    "seed_launch_draft",
]
