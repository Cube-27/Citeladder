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
import { checkoutAvailable } from './razorpay.ts';
import { scheduledSchema } from './settlement.ts';

const UNITS: Record<string, string> = {
  'counter.consumable': 'credits',
  'counter.occupancy': 'slots',
};

function unavailableReason(available: boolean, contactOnly: boolean) {
  if (available) return null;
  return contactOnly ? 'contact_only' : 'checkout_unavailable';
}

export async function publicCatalog(db: Database, config: ServiceConfig, country: string | null) {
  const published = await catalog(db);
  const region = country === 'IN' ? 'india' : 'international';
  const currency = region === 'india' ? 'INR' : 'USD';
  const money = (price: { currency: string; amount_minor: number } | null | undefined) =>
    price ? { currency: price.currency, amount_minor: price.amount_minor } : null;
  const item = (row: (typeof published.payload.addons)[number]) => {
    const available =
      row.available &&
      Boolean(row.modes.byok?.regional_prices[region]) &&
      checkoutAvailable(config.billing, config.razorpay, region);
    return {
      key: row.key,
      name: row.name,
      description: row.description,
      unit_price: money(row.modes.byok?.regional_prices[region]),
      quantity_min: row.quantity_min,
      quantity_max: row.quantity_max,
      availability: available ? 'available' : 'unavailable',
      unavailable_reason: available ? null : 'checkout_unavailable',
      grants_per_unit: row.modes.byok?.grants ?? [],
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
      const price = plan.regional_byok_prices[region];
      const available =
        plan.self_serve &&
        !plan.contact_only &&
        Boolean(price?.provider_price_ref) &&
        price?.tax_verified &&
        price.provider_mode === config.razorpay.mode &&
        checkoutAvailable(config.billing, config.razorpay, region);
      const funded = plan.funded_price;
      const coming = new Set<string>(policy.billing.contracts.coming_soon_plan_capability_keys);
      const capabilities = [
        ...plan.grants,
        ...(policy.billing.contracts.coming_soon_row_plan_keys.includes(plan.key)
          ? [...coming]
              .filter((key) => !plan.grants.some((grant) => grant.key === key))
              .map((key) => ({ key, value: null }))
          : []),
      ];
      return {
        key: plan.key,
        name: plan.name,
        description: plan.description,
        cadence: plan.cadence,
        self_serve: plan.self_serve,
        contact_only: plan.contact_only,
        contact_url: plan.contact_only ? config.billing.contactUrl : null,
        base_price: money(price ?? (region === 'international' ? plan.byok_price : null)),
        credit_price: null,
        funded_total_price: funded ? money(funded) : null,
        checkout_available: Boolean(available),
        unavailable_reason: unavailableReason(Boolean(available), plan.contact_only),
        capabilities: capabilities.map((grant) => ({
          key: grant.key,
          capability_type:
            policy.entitlements.capabilities[
              grant.key as keyof typeof policy.entitlements.capabilities
            ]?.type,
          value: grant.value === null ? null : capabilityValue(grant.key, grant.value),
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

async function occupancyHints(
  db: Database,
  workspaceId: string,
  values: ReadonlyMap<string, number>,
) {
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
  return [
    ['project_slots', Number(projects.count)],
    ['prompt_slots', Number(prompts.count)],
  ].flatMap(([key, consumed]) => {
    const allowance = values.get(String(key));
    return allowance === undefined
      ? []
      : [
          {
            key: String(key),
            allowance,
            consumed: Number(consumed),
            remaining: Math.max(0, allowance - Number(consumed)),
          },
        ];
  });
}

export async function entitlementRead(db: Database, workspaceId: string, at: Date) {
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
  const occupancy = await occupancyHints(db, workspaceId, state.values);
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
      const known = definition.type === 'counter.consumable' && !state.error;
      const allowance = known ? grants.reduce((sum, grant) => sum + grant.allowance, 0) : null;
      const consumed = known ? grants.reduce((sum, grant) => sum + grant.consumed, 0) : null;
      const reserved = known ? grants.reduce((sum, grant) => sum + grant.reserved, 0) : null;
      const hint = occupancy.find((row) => row.key === key);
      return {
        key,
        capability_type: definition.type,
        unit: UNITS[definition.type] ?? 'runs',
        limit_state: known || hint ? 'finite' : 'unknown',
        allowance: hint?.allowance ?? allowance,
        consumed: hint?.consumed ?? consumed,
        reserved: hint ? 0 : reserved,
        remaining:
          hint?.remaining ?? (known ? Math.max(0, allowance! - consumed! - reserved!) : null),
        window_started_at: null,
        resets_at: definition.rolling_window_seconds
          ? new Date(at.getTime() + definition.rolling_window_seconds * 1000).toISOString()
          : null,
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
    occupancy: state ? await occupancyHints(db, workspaceId, state.values) : [],
  });
}
