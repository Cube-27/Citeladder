/** Native commercial execution policy with shared operator/schema inputs. */
import runtime from './billing.json' with { type: 'json' };
import shared from '../generated/python-config.json' with { type: 'json' };
import { compareText } from '../text-order.ts';

const c = { ...shared.billing.contracts, ...runtime.contracts };
export const billing = {
  ...shared.billing,
  settings: { ...shared.billing.settings, ...runtime.settings },
  razorpay_settings: { ...shared.billing.razorpay_settings, ...runtime.razorpay_settings },
  contracts: {
    ...c,
    cadences: [c.cadence_monthly].sort(compareText),
    subscription_kinds: [c.subscription_kind_base].sort(compareText),
    live_subscription_statuses: [
      c.subscription_pending,
      c.subscription_trialing,
      c.subscription_active,
      c.subscription_past_due,
      c.subscription_cancel_scheduled,
    ].sort(compareText),
    razorpay_payment_status_map: {
      created: c.payment_pending,
      authorized: c.payment_pending,
      partially_paid: c.payment_pending,
      captured: c.payment_paid,
      paid: c.payment_paid,
      failed: c.payment_failed,
      cancelled: c.payment_failed,
      expired: c.payment_failed,
      refunded: c.payment_failed,
    },
    razorpay_status_map: {
      created: c.subscription_pending,
      authenticated: c.subscription_pending,
      active: c.subscription_active,
      pending: c.subscription_past_due,
      halted: c.subscription_unpaid,
      cancelled: c.subscription_cancelled,
      completed: c.subscription_expired,
      expired: c.subscription_expired,
      paused: c.subscription_past_due,
    },
    regions: [c.region_india, c.region_international],
    region_currencies: {
      [c.region_india]: c.currency_inr,
      [c.region_international]: c.currency_usd,
    },
    self_serve_plan_keys: [c.plan_tier_1, c.plan_tier_2, c.plan_tier_3],
    coming_soon_row_plan_keys: [c.plan_tier_2, c.plan_tier_3],
    activation_kinds: [
      c.activation_kind_base,
      c.activation_kind_addon,
      c.activation_kind_topup,
      c.activation_kind_upgrade,
    ].sort(compareText),
    one_time_activation_kinds: [
      c.activation_kind_addon,
      c.activation_kind_topup,
      c.activation_kind_upgrade,
    ].sort(compareText),
    activation_statuses: [
      c.activation_pending,
      c.activation_activated,
      c.activation_failed,
      c.activation_abandoned,
    ].sort(compareText),
    credential_modes: [c.credential_mode_byok, c.credential_mode_funded].sort(compareText),
    billing_telemetry_events: [
      c.telemetry_entitlement_unresolved,
      c.telemetry_funded_budget_exhausted,
      c.telemetry_consumable_credits_exhausted,
      c.telemetry_duplicate_grant_prevented,
    ],
  },
  providers: shared.providers.catalog.map((entry) => {
    const route = shared.providers.routes[entry.key as keyof typeof shared.providers.routes];
    return {
      ...entry,
      routes: route
        ? [
            {
              logical_engine: route.logical_engine,
              transport_provider: route.transport_provider,
              model: route.transport_model,
            },
          ]
        : [],
    };
  }),
};
