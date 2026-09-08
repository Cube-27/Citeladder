"""Bounded introductory-access commercial journeys.

The no-card campaign is catalog governed and disabled by default. Claims lock
one billing account, consume its lifetime introduction slot exactly once, and
issue one expiring primary Tier 1 bundle without provider or payment I/O.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.billing.catalog_revisions import (
    CatalogPayload,
    published_revision,
    validate_payload,
)
from app.domain.entitlements.grants import issue_grant_bundle, revoke_grants
from app.domain.entitlements.types import GrantSpec
from app.models.billing import (
    AccountGrant,
    BillingAccount,
    BillingSubscription,
)
from app.models.billing_journeys import IntroductoryClaim, IntroductoryOperatorCode
from app.models.user import User
from app.models.user_identity import UserIdentity


class IntroductoryAccessError(ValueError):
    """A safe refusal from the introductory-access policy boundary."""


@dataclass(frozen=True, slots=True)
class OfferState:
    campaign_id: uuid.UUID
    status: str
    tier_key: str
    duration_days: int
    eligibility_policy: str
    operator_code_allowed: bool
    unavailable_reason: str | None


@dataclass(frozen=True, slots=True)
class ClaimResult:
    campaign_id: uuid.UUID
    grant_id: uuid.UUID
    starts_at: datetime
    expires_at: datetime


def _fingerprint(
    *, campaign_id: uuid.UUID, terms: bool, data: bool, code: str | None
) -> str:
    payload = json.dumps(
        {
            "campaign_id": str(campaign_id),
            "terms_consent": terms,
            "data_sharing_consent": data,
            "operator_code_sha256": hashlib.sha256(code.encode()).hexdigest()
            if code
            else None,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).hexdigest()


_CAMPAIGN_NAMESPACE = uuid.UUID("5f0ae2be-21f3-4c0b-a312-b1d946f32921")


async def _catalog(session: AsyncSession) -> tuple[uuid.UUID, CatalogPayload, str]:
    row = await published_revision(session)
    payload = validate_payload(row.payload)
    # Offer identity survives catalog publication/retirement; terms still freeze
    # from the exact published revision onto the grant and claim.
    campaign_id = uuid.uuid5(_CAMPAIGN_NAMESPACE, payload.campaign.key)
    return campaign_id, payload, row.revision


def _campaign_status(
    payload: CatalogPayload, *, now: datetime
) -> tuple[str, str | None]:
    campaign = payload.campaign
    if (
        not campaign.enabled
        or not campaign.claim_available
        or campaign.state != "enabled"
    ):
        return "unavailable", "campaign_disabled"
    if campaign.cohort_started_at is None or now < campaign.cohort_started_at:
        return "unavailable", "campaign_not_started"
    if campaign.ends_at is not None and now >= campaign.ends_at:
        return "unavailable", "campaign_ended"
    return "available", None


async def offer_state(
    session: AsyncSession, *, account: BillingAccount, user: User, now: datetime
) -> OfferState:
    campaign_id, payload, _revision = await _catalog(session)
    prior = await session.scalar(
        select(IntroductoryClaim.id).where(
            IntroductoryClaim.billing_account_id == account.id
        )
    )
    campaign = payload.campaign
    status: str
    reason: str | None
    if prior is not None:
        status, reason = "already_claimed", "lifetime_introduction_consumed"
    else:
        status, reason = _campaign_status(payload, now=now)
        cohort_start = campaign.cohort_started_at
        if (
            status == "available"
            and cohort_start is not None
            and account.registration_cohort_at < cohort_start
        ):
            status, reason = "ineligible", "account_outside_campaign_cohort"
    return OfferState(
        campaign_id=campaign_id,
        status=status,
        tier_key=campaign.plan_key,
        duration_days=campaign.duration_days,
        eligibility_policy=campaign.eligibility_policy,
        operator_code_allowed=campaign.operator_code_allowed,
        unavailable_reason=reason,
    )


async def _has_disqualifying_access(
    session: AsyncSession, *, account_id: uuid.UUID
) -> bool:
    # Lifetime history matters: expiry, revocation, cancellation, and refunds
    # cannot make an account "new" again.
    non_free_primary = await session.scalar(
        select(AccountGrant.id)
        .where(
            AccountGrant.billing_account_id == account_id,
            AccountGrant.bundle_role == "primary",
            AccountGrant.profile_key != "free",
        )
        .limit(1)
    )
    paid_history = await session.scalar(
        select(BillingSubscription.id)
        .where(BillingSubscription.billing_account_id == account_id)
        .limit(1)
    )
    return non_free_primary is not None or paid_history is not None


async def _operator_waiver(
    session: AsyncSession,
    *,
    account: BillingAccount,
    user: User,
    code: str | None,
    now: datetime,
) -> IntroductoryOperatorCode | None:
    if not code:
        return None
    digest = hashlib.sha256(code.encode()).hexdigest()
    row = await session.scalar(
        select(IntroductoryOperatorCode)
        .where(IntroductoryOperatorCode.code_sha256 == digest)
        .with_for_update()
    )
    if (
        row is None
        or row.expires_at <= now
        or row.redemption_count >= row.redemption_limit
        or row.waiver_scope != "oauth_verified_work_email"
        or (row.billing_account_id is not None and row.billing_account_id != account.id)
        or (
            row.email_normalized is not None
            and row.email_normalized != user.email.casefold()
        )
    ):
        raise IntroductoryAccessError("operator_code_invalid")
    return row


async def _work_email_eligible(session: AsyncSession, *, user: User) -> bool:
    return bool(
        await session.scalar(
            select(UserIdentity.id)
            .where(
                UserIdentity.user_id == user.id,
                UserIdentity.email_verified.is_(True),
                UserIdentity.email == user.email,
            )
            .limit(1)
        )
    )


def _replay_claim(
    prior: IntroductoryClaim | None, *, idempotency_key: str, fingerprint: str
) -> ClaimResult | None:
    if prior is None:
        return None
    if (
        prior.idempotency_key != idempotency_key
        or prior.request_fingerprint != fingerprint
    ):
        raise IntroductoryAccessError("lifetime_introduction_consumed")
    return ClaimResult(
        prior.campaign_id, prior.primary_grant_id, prior.claimed_at, prior.expires_at
    )


async def _validate_claim_eligibility(
    session: AsyncSession,
    *,
    account: BillingAccount,
    user: User,
    campaign_id: uuid.UUID,
    operator_code: str | None,
    claimed_at: datetime,
) -> tuple[CatalogPayload, str, IntroductoryOperatorCode | None]:
    actual_campaign_id, payload, revision = await _catalog(session)
    if actual_campaign_id != campaign_id:
        raise IntroductoryAccessError("campaign_identity_changed")
    status = await offer_state(session, account=account, user=user, now=claimed_at)
    if status.status != "available":
        raise IntroductoryAccessError(status.unavailable_reason or status.status)
    if await _has_disqualifying_access(session, account_id=account.id):
        raise IntroductoryAccessError("introductory_access_cannot_stack")
    waiver = await _operator_waiver(
        session, account=account, user=user, code=operator_code, now=claimed_at
    )
    if (
        payload.campaign.eligibility_policy == "oauth_verified_work_email"
        and not await _work_email_eligible(session, user=user)
        and waiver is None
    ):
        raise IntroductoryAccessError("oauth_verified_work_email_required")
    return payload, revision, waiver


async def _persist_claim(
    session: AsyncSession,
    *,
    account: BillingAccount,
    user: User,
    campaign_id: uuid.UUID,
    idempotency_key: str,
    fingerprint: str,
    claimed_at: datetime,
    payload: CatalogPayload,
    revision: str,
    waiver: IntroductoryOperatorCode | None,
) -> ClaimResult:
    plan = next(plan for plan in payload.plans if plan.key == payload.campaign.plan_key)
    expires_at = claimed_at + timedelta(days=payload.campaign.duration_days)
    claim_id = uuid.uuid4()
    grants = await issue_grant_bundle(
        session,
        account_id=account.id,
        source_kind="trial",
        source_ref=f"intro:{claim_id}",
        grants=tuple(GrantSpec(key=row.key, value=row.value) for row in plan.grants),
        catalog_revision=revision,
        idempotency_key=f"intro:{claim_id}",
        valid_from=claimed_at,
        valid_until=expires_at,
        bundle_role="primary",
        profile_key="no_card_promotion",
        profile_priority=200,
        bundle_id=f"intro:{claim_id}",
    )
    session.add(
        IntroductoryClaim(
            id=claim_id,
            billing_account_id=account.id,
            campaign_id=campaign_id,
            introduction_kind="no_card_promotion",
            tier_key="tier_1",
            primary_grant_id=grants[0].id,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
            terms_consent_version="no-card-intro-v1",
            data_sharing_consent_version="provider-data-v1",
            consented_by_user_id=user.id,
            claimed_at=claimed_at,
            expires_at=expires_at,
            operator_code_id=waiver.id if waiver else None,
        )
    )
    if waiver is not None:
        waiver.redemption_count += 1
    await session.commit()
    return ClaimResult(campaign_id, grants[0].id, claimed_at, expires_at)


async def claim_introductory_access(
    session: AsyncSession,
    *,
    account: BillingAccount,
    user: User,
    campaign_id: uuid.UUID,
    idempotency_key: str,
    terms_consent: bool,
    data_sharing_consent: bool,
    operator_code: str | None,
    now: datetime | None = None,
) -> ClaimResult:
    claimed_at = now or datetime.now(UTC)
    if not terms_consent or not data_sharing_consent:
        raise IntroductoryAccessError("explicit_consent_required")
    locked = await session.scalar(
        select(BillingAccount).where(BillingAccount.id == account.id).with_for_update()
    )
    if locked is None:
        raise IntroductoryAccessError("billing_account_unavailable")
    fingerprint = _fingerprint(
        campaign_id=campaign_id,
        terms=terms_consent,
        data=data_sharing_consent,
        code=operator_code,
    )
    prior = await session.scalar(
        select(IntroductoryClaim).where(
            IntroductoryClaim.billing_account_id == account.id
        )
    )
    replay = _replay_claim(
        prior, idempotency_key=idempotency_key, fingerprint=fingerprint
    )
    if replay is not None:
        return replay
    payload, revision, waiver = await _validate_claim_eligibility(
        session,
        account=account,
        user=user,
        campaign_id=campaign_id,
        operator_code=operator_code,
        claimed_at=claimed_at,
    )
    return await _persist_claim(
        session,
        account=account,
        user=user,
        campaign_id=campaign_id,
        idempotency_key=idempotency_key,
        fingerprint=fingerprint,
        claimed_at=claimed_at,
        payload=payload,
        revision=revision,
        waiver=waiver,
    )


async def end_introductory_access(
    session: AsyncSession,
    *,
    account: BillingAccount,
    user: User,
    idempotency_key: str,
    now: datetime | None = None,
) -> datetime:
    ended_at = now or datetime.now(UTC)
    claim = await session.scalar(
        select(IntroductoryClaim)
        .where(IntroductoryClaim.billing_account_id == account.id)
        .with_for_update()
    )
    if claim is None:
        raise IntroductoryAccessError("introductory_access_not_found")
    if claim.ended_at is not None:
        return claim.ended_at
    grant_ids = tuple(
        (
            await session.scalars(
                select(AccountGrant.id).where(
                    AccountGrant.bundle_id == f"intro:{claim.id}"
                )
            )
        ).all()
    )
    await revoke_grants(
        session,
        grant_ids=grant_ids,
        effective_from=ended_at,
        reason="billing owner ended no-card introductory access",
        actor_kind="billing_owner",
        actor_user_id=user.id,
        idempotency_key=idempotency_key,
    )
    claim.ended_at = ended_at
    claim.ended_by_user_id = user.id
    await session.commit()
    return ended_at
