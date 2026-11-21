import { isOneOf } from '@/lib/utils';
import type {
  BillingCatalog,
  CatalogAddon,
  CatalogPlan,
  CatalogTopup,
  CredentialMode,
  SelfServePlanKey,
} from '@/lib/api/billing';
import type { moneySchema, SubscriptionStatus } from '@citeladder/contracts/billing';
import type { z } from 'zod';

export const SUBSCRIBED_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'active',
  'trialing',
  'past_due',
  'cancel_scheduled',
]);

export type Money = z.infer<typeof moneySchema>;

export type HeadlinePrice =
  | { kind: 'price'; money: Money }
  | { kind: 'contact' }
  | { kind: 'unavailable'; reason: string | null };

export function catalogPlanByKey(catalog: BillingCatalog, key: string): CatalogPlan | undefined {
  return catalog.plans.find((plan) => plan.key === key);
}

export function catalogItemName(catalog: BillingCatalog, key: string): string {
  const entry = [...catalog.plans, ...catalog.addons, ...catalog.topups].find(
    (candidate) => candidate.key === key,
  );
  return entry?.name ?? key;
}

export function isSelfServeKey(key: string): key is SelfServePlanKey {
  return key === 'tier_1' || key === 'tier_2' || key === 'tier_3';
}

export function headlinePrice(plan: CatalogPlan, mode: CredentialMode): HeadlinePrice {
  if (plan.contact_only) {
    return { kind: 'contact' };
  }
  if (mode === 'funded') {
    return plan.funded_total_price
      ? { kind: 'price', money: plan.funded_total_price }
      : { kind: 'unavailable', reason: plan.unavailable_reason };
  }
  return plan.base_price
    ? { kind: 'price', money: plan.base_price }
    : { kind: 'unavailable', reason: plan.unavailable_reason };
}

export type CheckoutSelection =
  | { ok: true; catalog_key: SelfServePlanKey; credential_mode: CredentialMode }
  | { ok: false; reason: string | null };

export function checkoutSelection(plan: CatalogPlan, mode: CredentialMode): CheckoutSelection {
  if (plan.contact_only || !plan.self_serve || !isSelfServeKey(plan.key)) {
    return { ok: false, reason: plan.unavailable_reason };
  }
  if (!(mode === 'funded' ? plan.funded_checkout_available : plan.checkout_available)) {
    return { ok: false, reason: plan.unavailable_reason };
  }
  return { ok: true, catalog_key: plan.key, credential_mode: mode };
}

export type ComparisonRow = {
  key: string;
  values: Record<string, CatalogPlan['capabilities'][number] | undefined>;
};

export function comparisonRows(catalog: BillingCatalog): ComparisonRow[] {
  const keys = new Set<string>();
  for (const plan of catalog.plans) {
    for (const capability of plan.capabilities) {
      keys.add(capability.key);
    }
  }
  return [...keys].map((key) => ({
    key,
    values: Object.fromEntries(
      catalog.plans.map((plan) => [plan.key, plan.capabilities.find((c) => c.key === key)]),
    ),
  }));
}

export function isPurchasable(entry: CatalogAddon | CatalogTopup): boolean {
  return entry.availability === 'available' && entry.unit_price !== null;
}

export function selfServeCheckoutComingSoon(catalog: BillingCatalog): boolean {
  const selfServePlans = catalog.plans.filter((plan) => plan.self_serve && !plan.contact_only);
  return selfServePlans.length > 0 && selfServePlans.every((plan) => !plan.checkout_available);
}

export function newPlanCheckoutClosed(catalog: BillingCatalog): boolean {
  return (
    selfServeCheckoutComingSoon(catalog) &&
    !catalog.plans.some((plan) => plan.funded_checkout_available)
  );
}

export function formatMoney(money: Money, minorUnits: number): string {
  const value = money.amount_minor / 10 ** minorUnits;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: money.currency,
    minimumFractionDigits: value % 1 === 0 ? 0 : minorUnits,
    maximumFractionDigits: minorUnits,
  }).format(value);
}

export type PlanChangeDirection = 'upgrade' | 'downgrade';

export function planChangeDirection(
  current: CatalogPlan,
  target: CatalogPlan,
): PlanChangeDirection | null {
  if (current.key === target.key || !current.base_price || !target.base_price) return null;
  const delta = target.base_price.amount_minor - current.base_price.amount_minor;
  if (delta === 0) return null;
  return delta > 0 ? 'upgrade' : 'downgrade';
}

export function extrasForPlan(
  catalog: BillingCatalog,
  planKey: string,
): { addons: CatalogAddon[]; topups: CatalogTopup[] } {
  const eligible = (entry: CatalogAddon | CatalogTopup) =>
    isOneOf(entry.eligible_plan_keys, planKey);
  return { addons: catalog.addons.filter(eligible), topups: catalog.topups.filter(eligible) };
}
