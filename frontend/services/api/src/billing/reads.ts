import { sql } from 'kysely';
import {
  billingCatalogSchema,
  billingEntitlementSchema,
  billingUsageSchema,
  workspaceEntitlementSchema,
} from '@citeladder/contracts/billing';
import type { Database } from '../db/database.ts';
import type { ServiceConfig } from '../config.ts';
import { policy } from '../config.ts';
import { accountState, drawOrder, grantExpiry } from '../entitlements/state.ts';
import { ledgerBalances } from '../entitlements/ledger.ts';
import { workspaceAccount } from './purchases.ts';
import { catalog, capabilityValue } from './catalog.ts';
import { credentialModeOf, type CredentialMode } from './credential-mode.ts';
import { checkoutAvailable } from './razorpay.ts';
import { cancellationHeldUntil } from './cancellation.ts';
import { scheduledSchema } from './settlement.ts';
import { apiKeyCount, marketCount } from '../entitlements/occupancy.ts';
import { manualRunUsage } from '../audits/admission.ts';
import { monitoredUrlCount } from '../site-health/reads/runtime.ts';

const UNITS: Record<string, string> = {
  'counter.consumable': 'credits',
  'counter.occupancy': 'slots',
};

function unavailableReason(available: boolean, contactOnly: boolean) {
  if (available) return null;
  return contactOnly ? 'contact_only' : 'checkout_unavailable';
}

/**
 * The catalog as a reader may buy from it: anonymous readers (marketing) are
 * never on the checkout allow-list, a workspace is when the operator granted it
 * (B2), so in-app billing and marketing follow the same signal. Add-ons and
 * top-ups are priced in the workspace's credential mode, the mode a purchase is
 * quoted in; anonymous readers see the BYOK price.
 */
export async function publicCatalog(
  db: Database,
  config: ServiceConfig,
  country: string | null,
  { allowListed = false, mode = 'byok' }: { allowListed?: boolean; mode?: CredentialMode } = {},
) {
  const published = await catalog(db);
  const region = country === 'IN' ? 'india' : 'international';
  const currency = region === 'india' ? 'INR' : 'USD';
  const money = (price: { currency: string; amount_minor: number } | null | undefined) =>
    price ? { currency: price.currency, amount_minor: price.amount_minor } : null;
  const item = (row: (typeof published.payload.addons)[number]) => {
    const offer = row.modes[mode];
    const available =
      row.available &&
      Boolean(offer?.regional_prices[region]) &&
      checkoutAvailable(config.billing, config.razorpay, region, allowListed);
    return {
      key: row.key,
      name: row.name,
      description: row.description,
      unit_price: money(offer?.regional_prices[region]),
      quantity_min: row.quantity_min,
      quantity_max: row.quantity_max,
      availability: available ? 'available' : 'unavailable',
      unavailable_reason: available ? null : 'checkout_unavailable',
      grants_per_unit: offer?.grants ?? [],
      eligible_plan_keys: row.eligible_plan_keys,
      expiry_days: row.expiry_days,
    };
  };
  return billingCatalogSchema.parse({
    catalog_revision: published.revision,
    country_code: country,
    region,
    currency,
    currency_minor_units: 2,
    plans: published.payload.plans.map((plan) => {
      // Each mode is purchasable only with its own verified provider plan (B32).
      const offer = (mode: 'byok' | 'funded') => {
        const price = plan.regional_prices[mode][region];
        const listed = mode === 'byok' ? plan.byok_price : plan.funded_price;
        return {
          price: money(price ?? (region === 'international' ? listed : null)),
          available: Boolean(
            plan.self_serve &&
            !plan.contact_only &&
            price?.provider_price_ref &&
            price.tax_verified &&
            price.provider_mode === config.razorpay.mode &&
            checkoutAvailable(config.billing, config.razorpay, region, allowListed),
          ),
        };
      };
      const byok = offer('byok'),
        funded = offer('funded');
      return {
        key: plan.key,
        name: plan.name,
        description: plan.description,
        cadence: plan.cadence,
        self_serve: plan.self_serve,
        contact_only: plan.contact_only,
        contact_url: plan.contact_only ? config.billing.contactUrl : null,
        base_price: byok.price,
        funded_total_price: funded.price,
        checkout_available: byok.available,
        funded_checkout_available: funded.available,
        unavailable_reason: unavailableReason(byok.available, plan.contact_only),
        capabilities: plan.grants.map((grant) => ({
          key: grant.key,
          capability_type:
            policy.entitlements.capabilities[
              grant.key as keyof typeof policy.entitlements.capabilities
            ]?.type,
          value: capabilityValue(grant.key, grant.value),
          issuable:
            policy.entitlements.capabilities[
              grant.key as keyof typeof policy.entitlements.capabilities
            ]?.issuable,
        })),
        trial_availability: 'unavailable',
        trial_unavailable_reason: 'trial_unavailable',
        trial_days: config.billing.trialDays,
      };
    }),
    addons: published.payload.addons.map(item),
    topups: published.payload.topups.map(item),
    providers: policy.billing.providers,
    support_contact: published.payload.support_contact
      ? {
          ...published.payload.support_contact,
          phone: published.payload.support_contact.phone || null,
        }
      : null,
  });
}

/** What each occupancy counter has in use, counted as its admission check counts it. */
async function occupancyCounts(
  db: Database,
  workspaceId: string,
  at: Date,
): Promise<ReadonlyMap<string, number>> {
  const projects = await db
    .selectFrom('projects')
    .select(sql<string>`count(*)`.as('count'))
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirstOrThrow();
  const prompts = await db
    .selectFrom('prompts')
    .innerJoin('prompt_sets', 'prompt_sets.id', 'prompts.prompt_set_id')
    .innerJoin('projects', 'projects.id', 'prompt_sets.project_id')
    .select(sql<string>`count(*)`.as('count'))
    .where('projects.workspace_id', '=', workspaceId)
    .executeTakeFirstOrThrow();
  const { entitlements } = policy;
  return new Map([
    [entitlements.project_slots, Number(projects.count)],
    [entitlements.prompt_slots, Number(prompts.count)],
    ['monitored_urls', await monitoredUrlCount(db, workspaceId)],
    [entitlements.api_keys, await apiKeyCount(db, workspaceId, at)],
    [entitlements.market_slots, await marketCount(db, workspaceId)],
  ]);
}

async function occupancyHints(
  db: Database,
  workspaceId: string,
  values: ReadonlyMap<string, number>,
  at: Date,
) {
  return [...(await occupancyCounts(db, workspaceId, at))].flatMap(([key, consumed]) => {
    const allowance = values.get(key);
    return allowance === undefined
      ? []
      : [{ key, allowance, consumed, remaining: Math.max(0, allowance - consumed) }];
  });
}

export async function entitlementRead(
  db: Database,
  config: ServiceConfig,
  workspaceId: string,
  at: Date,
) {
  const account = await workspaceAccount(db, workspaceId);
  const state = await accountState(db, workspaceId, account.id, at);
  const sub = state.subscription;
  const change = sub?.scheduled_change ? scheduledSchema.parse(sub.scheduled_change) : null;
  const deadlines = state.grants
    .filter((grant) => grant.source_kind === 'trial')
    .flatMap((grant) => (grant.valid_until ? [grant.valid_until.getTime()] : []));
  const deadline = deadlines.length ? Math.max(...deadlines) : null;
  return billingEntitlementSchema.parse({
    billing_account_id: account.id,
    status: state.error ? 'entitlement_unresolved' : 'resolved',
    errors: state.error ? [state.error] : [],
    registry_revision: policy.entitlements.registry_revision,
    entitlement_lifecycle_version: account.entitlement_lifecycle_version,
    resolved_at: at.toISOString(),
    valid_until: state.validUntil?.toISOString() ?? null,
    subscription: sub
      ? {
          catalog_key: sub.catalog_key,
          status: sub.status,
          current_period_end: sub.current_period_end?.toISOString() ?? null,
          cancel_at_period_end: sub.cancel_at_period_end,
          resumable_until: cancellationHeldUntil(sub, config, at)?.toISOString() ?? null,
          scheduled_change: change
            ? {
                direction: change.direction,
                catalog_key: change.catalog_key,
                effective_at: change.effective_at,
                state: change.state,
              }
            : null,
        }
      : null,
    trial_grant:
      deadline === null
        ? null
        : {
            deadline: new Date(deadline).toISOString(),
            days_remaining: Math.max(0, Math.floor((deadline - at.getTime()) / 86_400_000)),
            exhausted: deadline <= at.getTime(),
          },
    capabilities: [...state.values].map(([key, value]) => ({
      key,
      capability_type:
        policy.entitlements.capabilities[key as keyof typeof policy.entitlements.capabilities]!
          .type,
      value: capabilityValue(key, value),
      contributing_grant_ids: state.selected
        .filter((grant) => grant.key === key)
        .map((grant) => grant.id),
      ordered_draw_grant_ids:
        policy.entitlements.capabilities[key as keyof typeof policy.entitlements.capabilities]!
          .type === 'counter.consumable'
          ? drawOrder(
              state.selected.filter((grant) => grant.key === key),
              state.end,
            ).map((grant) => grant.id)
          : [],
    })),
    grants: state.grants.map((grant) => ({
      grant_id: grant.id,
      source_kind: grant.source_kind,
      key: grant.key,
      value: grant.value,
      valid_from: grant.valid_from.toISOString(),
      effective_valid_until: grantExpiry(grant, state.end)?.toISOString() ?? null,
      revoked_at: state.revokedAt.get(grant.id)?.toISOString() ?? null,
      catalog_revision: grant.catalog_revision,
    })),
  });
}

export async function usageRead(db: Database, workspaceId: string, at: Date) {
  const account = await workspaceAccount(db, workspaceId);
  const state = await accountState(db, workspaceId, account.id, at);
  const balances = await ledgerBalances(db, account.id);
  const occupancy = await occupancyCounts(db, workspaceId, at);
  const manualRuns = await manualRunUsage(db, account.id, { at, launchId: null });
  const rates = new Map([['manual_runs_per_day', manualRuns]]);
  /**
   * A consumable sums its grants' ledger balances. Occupancy and rate counters
   * count what is in use as admission does: no occupancy grant admits none,
   * and no rate grant means no rate limit.
   */
  const aggregate = (
    key: string,
    type: string,
    grants: readonly { allowance: number; consumed: number; reserved: number }[],
  ) => {
    const sum = (field: 'allowance' | 'consumed' | 'reserved') =>
      grants.reduce((total, grant) => total + grant[field], 0);
    const rate = rates.get(key);
    const used = type === 'counter.rate' ? rate?.used : occupancy.get(key);
    const unknown = {
      limit_state: 'unknown',
      allowance: null,
      consumed: null,
      reserved: null,
      remaining: null,
      resets_at: null,
    };
    if (state.error) return unknown;
    if (type === 'counter.consumable') {
      const [allowance, consumed, reserved] = [sum('allowance'), sum('consumed'), sum('reserved')];
      const remaining = Math.max(0, allowance - consumed - reserved);
      return { ...unknown, limit_state: 'finite', allowance, consumed, reserved, remaining };
    }
    if (used === undefined) return unknown;
    const allowance = state.values.get(key);
    if (type === 'counter.rate' && allowance === undefined)
      return { ...unknown, limit_state: 'unlimited', consumed: used, reserved: 0 };
    return {
      limit_state: 'finite',
      allowance: allowance ?? 0,
      consumed: used,
      reserved: 0,
      remaining: Math.max(0, (allowance ?? 0) - used),
      resets_at: rate?.resetsAt?.toISOString() ?? null,
    };
  };
  const items = Object.entries(policy.entitlements.capabilities)
    .filter(([, definition]) => definition.public && definition.type.startsWith('counter.'))
    .map(([key, definition]) => {
      const selected = state.selected.filter((grant) => grant.key === key);
      const grants = selected.map((grant) => {
        const balance = balances.get(grant.id) ?? { consumed: 0, reserved: 0 };
        return {
          grant_id: grant.id,
          source_kind: grant.source_kind,
          allowance: grant.value,
          ...balance,
          remaining: Math.max(0, grant.value - balance.consumed - balance.reserved),
          effective_valid_until: grantExpiry(grant, state.end)?.toISOString() ?? null,
        };
      });
      const expiries = grants
        .flatMap((grant) => (grant.effective_valid_until ? [grant.effective_valid_until] : []))
        .sort((a, b) => a.localeCompare(b));
      return {
        key,
        capability_type: definition.type,
        unit: UNITS[definition.type] ?? 'runs',
        ...aggregate(key, definition.type, grants),
        window_started_at: null,
        earliest_expiry: expiries[0] ?? null,
        grants,
      };
    });
  return billingUsageSchema.parse({
    billing_account_id: account.id,
    entitlement_lifecycle_version: account.entitlement_lifecycle_version,
    status: state.error ? 'entitlement_unresolved' : 'resolved',
    items,
  });
}

export async function workspaceEntitlementRead(db: Database, workspaceId: string, at: Date) {
  const account = await db
    .selectFrom('billing_accounts')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  const state = account ? await accountState(db, workspaceId, account.id, at) : null;
  return workspaceEntitlementSchema.parse({
    workspace_id: workspaceId,
    status: !state || state.error ? 'entitlement_unresolved' : 'resolved',
    registry_revision: policy.entitlements.registry_revision,
    entitlement_lifecycle_version: account?.entitlement_lifecycle_version ?? 0,
    valid_until: state?.validUntil?.toISOString() ?? null,
    credential_mode: credentialModeOf(state?.subscription),
    capabilities: state
      ? [...state.values].map(([key, value]) => ({
          key,
          type: policy.entitlements.capabilities[
            key as keyof typeof policy.entitlements.capabilities
          ]!.type,
          value: capabilityValue(key, value),
          valid_until: state.validUntil?.toISOString() ?? null,
          provenance: 'effective_grant',
        }))
      : [],
    occupancy: state ? await occupancyHints(db, workspaceId, state.values, at) : [],
  });
}
