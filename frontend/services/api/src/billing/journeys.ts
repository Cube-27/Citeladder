import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { noCardOfferSchema, noCardClaimSchema } from '@citeladder/contracts/billing';
import type { Database } from '../db/database.ts';
import { lockAccount, issueBundle, revokeBundle } from '../entitlements/grants.ts';
import { workspaceAccount } from './purchases.ts';
import { catalog } from './catalog.ts';
import { conflict, digest } from './contracts.ts';
import { policy } from '../config.ts';

export const claimRequest = z
  .object({
    campaign_id: z.uuid(),
    terms_consent: z.boolean(),
    data_sharing_consent: z.boolean(),
    operator_code: z.string().min(16).max(255).nullable().default(null),
  })
  .strict();

/** RFC 9562 v5 identity persists across catalog revisions and both stacks. */
function campaignId(key: string) {
  const bytes = createHash('sha1')
    .update(Buffer.from('5f0ae2be21f34c0ba312b1d946f32921', 'hex'))
    .update(key)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 80;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function offerRead(db: Database, workspaceId: string, now: Date) {
  const account = await workspaceAccount(db, workspaceId);
  const published = await catalog(db);
  const campaign = published.payload.campaign;
  let status: 'available' | 'unavailable' | 'already_claimed' | 'ineligible' = 'available';
  let reason: string | null = null;
  if (
    await db
      .selectFrom('introductory_claims')
      .select('id')
      .where('billing_account_id', '=', account.id)
      .executeTakeFirst()
  ) {
    status = 'already_claimed';
    reason = 'lifetime_introduction_consumed';
  } else if (!campaign.enabled || !campaign.claim_available || campaign.state !== 'enabled') {
    status = 'unavailable';
    reason = 'campaign_disabled';
  } else if (!campaign.cohort_started_at || now < new Date(campaign.cohort_started_at)) {
    status = 'unavailable';
    reason = 'campaign_not_started';
  } else if (campaign.ends_at && now >= new Date(campaign.ends_at)) {
    status = 'unavailable';
    reason = 'campaign_ended';
  } else if (account.registration_cohort_at < new Date(campaign.cohort_started_at)) {
    status = 'ineligible';
    reason = 'account_outside_campaign_cohort';
  }
  return noCardOfferSchema.parse({
    campaign_id: campaignId(campaign.key),
    status,
    tier_key: campaign.plan_key,
    duration_days: campaign.duration_days,
    eligibility_policy: campaign.eligibility_policy,
    operator_code_allowed: campaign.operator_code_allowed,
    unavailable_reason: reason,
  });
}

export async function claimOffer(
  db: Database,
  workspaceId: string,
  userId: string,
  request: z.infer<typeof claimRequest>,
  key: string,
) {
  if (!request.terms_consent || !request.data_sharing_consent)
    conflict('explicit_consent_required');
  return db.transaction().execute(async (trx) => {
    const account = await workspaceAccount(trx, workspaceId);
    await lockAccount(trx, workspaceId, account.id);
    const fingerprint = digest({
      campaignId: request.campaign_id,
      terms: request.terms_consent,
      data: request.data_sharing_consent,
      code: request.operator_code
        ? createHash('sha256').update(request.operator_code).digest('hex')
        : null,
    });
    const prior = await trx
      .selectFrom('introductory_claims')
      .selectAll()
      .where('billing_account_id', '=', account.id)
      .executeTakeFirst();
    if (prior) {
      const waiver = prior.operator_code_id
        ? await trx
            .selectFrom('introductory_operator_codes')
            .select('code_sha256')
            .where('id', '=', prior.operator_code_id)
            .executeTakeFirst()
        : null;
      const codeMatches = request.operator_code
        ? waiver?.code_sha256 === createHash('sha256').update(request.operator_code).digest('hex')
        : !prior.operator_code_id;
      if (
        prior.idempotency_key !== key ||
        prior.campaign_id !== request.campaign_id ||
        !codeMatches
      )
        conflict('lifetime_introduction_consumed');
      return noCardClaimSchema.parse({
        campaign_id: prior.campaign_id,
        grant_id: prior.primary_grant_id,
        tier_key: 'tier_1',
        starts_at: prior.claimed_at.toISOString(),
        expires_at: prior.expires_at.toISOString(),
        charged: false,
        renews: false,
      });
    }
    const now = new Date();
    const offer = await offerRead(trx, workspaceId, now);
    if (offer.campaign_id !== request.campaign_id) conflict('campaign_identity_changed');
    if (offer.status !== 'available') conflict(offer.unavailable_reason ?? offer.status);
    const history = await trx
      .selectFrom('account_grants')
      .select('id')
      .where('billing_account_id', '=', account.id)
      .where('bundle_role', '=', 'primary')
      .where('profile_key', '!=', 'free')
      .executeTakeFirst();
    const subscription = await trx
      .selectFrom('billing_subscriptions')
      .select('id')
      .where('billing_account_id', '=', account.id)
      .executeTakeFirst();
    if (history || subscription) conflict('introductory_access_cannot_stack');
    const user = await trx
      .selectFrom('users')
      .select('email')
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();
    let waiverId: string | null = null;
    if (request.operator_code) {
      if (!offer.operator_code_allowed) conflict('operator_code_invalid');
      const digest = createHash('sha256').update(request.operator_code).digest('hex');
      const waiver = await trx
        .selectFrom('introductory_operator_codes')
        .selectAll()
        .where('code_sha256', '=', digest)
        .forUpdate()
        .executeTakeFirst();
      if (
        !waiver ||
        waiver.expires_at <= now ||
        waiver.redemption_count >= waiver.redemption_limit ||
        waiver.waiver_scope !== 'oauth_verified_work_email' ||
        (waiver.billing_account_id && waiver.billing_account_id !== account.id) ||
        (waiver.email_normalized && waiver.email_normalized !== user.email.toLowerCase())
      )
        conflict('operator_code_invalid');
      waiverId = waiver.id;
      await trx
        .updateTable('introductory_operator_codes')
        .set({ redemption_count: waiver.redemption_count + 1 })
        .where('id', '=', waiver.id)
        .execute();
    }
    if (
      offer.eligibility_policy === 'oauth_verified_work_email' &&
      !waiverId &&
      !(await trx
        .selectFrom('user_identities')
        .select('id')
        .where('user_id', '=', userId)
        .where('email_verified', '=', true)
        .where('email', '=', user.email)
        .executeTakeFirst())
    )
      conflict('oauth_verified_work_email_required');
    const published = await catalog(trx);
    const plan = published.payload.plans.find((row) => row.key === 'tier_1')!;
    const id = randomUUID();
    const end = new Date(now.getTime() + offer.duration_days * 86_400_000);
    const grants = await issueBundle(trx, {
      workspaceId,
      accountId: account.id,
      key: `intro:${id}`,
      sourceKind: 'trial',
      sourceRef: `intro:${id}`,
      specs: plan.grants,
      revision: published.revision,
      from: now,
      until: end,
      primary: true,
      profile: 'no_card_promotion',
      priority: policy.billing.contracts.plan_bundle_priority,
    });
    await trx
      .insertInto('introductory_claims')
      .values({
        id,
        billing_account_id: account.id,
        campaign_id: offer.campaign_id,
        introduction_kind: 'no_card_promotion',
        tier_key: 'tier_1',
        primary_grant_id: grants[0]!.id,
        idempotency_key: key,
        request_fingerprint: fingerprint,
        terms_consent_version: 'no-card-intro-v1',
        data_sharing_consent_version: 'provider-data-v1',
        consented_by_user_id: userId,
        claimed_at: now,
        expires_at: end,
        operator_code_id: waiverId,
        ended_at: null,
        ended_by_user_id: null,
        created_at: now,
      })
      .execute();
    return noCardClaimSchema.parse({
      campaign_id: offer.campaign_id,
      grant_id: grants[0]!.id,
      tier_key: 'tier_1',
      starts_at: now.toISOString(),
      expires_at: end.toISOString(),
      charged: false,
      renews: false,
    });
  });
}

export async function endOffer(db: Database, workspaceId: string, userId: string, key: string) {
  return db.transaction().execute(async (trx) => {
    const account = await workspaceAccount(trx, workspaceId);
    await lockAccount(trx, workspaceId, account.id);
    const claim = await trx
      .selectFrom('introductory_claims')
      .selectAll()
      .where('billing_account_id', '=', account.id)
      .forUpdate()
      .executeTakeFirst();
    if (!claim) conflict('introductory_access_not_found');
    if (claim.ended_at) return { status: 'ended' as const, ended_at: claim.ended_at.toISOString() };
    const grants = await trx
      .selectFrom('account_grants')
      .select('id')
      .where('billing_account_id', '=', account.id)
      .where('bundle_id', '=', `intro:${claim.id}`)
      .execute();
    const now = new Date();
    await revokeBundle(trx, {
      workspaceId,
      accountId: account.id,
      grantIds: grants.map((row) => row.id),
      key,
      actorKind: 'billing_owner',
      actorId: userId,
      reason: 'billing owner ended no-card introductory access',
      at: now,
    });
    await trx
      .updateTable('introductory_claims')
      .set({ ended_at: now, ended_by_user_id: userId })
      .where('id', '=', claim.id)
      .execute();
    return { status: 'ended' as const, ended_at: now.toISOString() };
  });
}
