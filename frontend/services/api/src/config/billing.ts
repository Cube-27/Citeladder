import { subscriptionStatusSchema } from '@citeladder/contracts/billing';
import { providers } from './providers.ts';
import runtime from './billing.json' with { type: 'json' };
import aiCredits from './ai-credits.json' with { type: 'json' };
import { compareText } from '../text-order.ts';

const c = runtime.contracts;
const s = subscriptionStatusSchema.enum;
const liveSubscriptionStatuses: readonly string[] = [
  s.pending,
  s.trialing,
  s.active,
  s.past_due,
  s.cancel_scheduled,
].sort(compareText);
const terminalSubscriptionStatuses: readonly string[] = [s.cancelled, s.expired].sort(compareText);
export const billing = {
  ...runtime,
  ai_credits: aiCredits,
  subscription_status: s,
  contracts: {
    ...c,
    live_subscription_statuses: liveSubscriptionStatuses,
    terminal_subscription_statuses: terminalSubscriptionStatuses,
    razorpay_payment_status_map: {
      created: c.payment_pending,
      authorized: c.payment_pending,
      partially_paid: c.payment_pending,
      captured: c.payment_paid,
      paid: c.payment_paid,
      failed: c.payment_failed,
      cancelled: c.payment_failed,
      expired: c.payment_failed,
      refunded: c.payment_paid,
    },
    razorpay_status_map: {
      created: s.pending,
      authenticated: s.pending,
      active: s.active,
      pending: s.past_due,
      halted: s.unpaid,
      cancelled: s.cancelled,
      completed: s.expired,
      expired: s.expired,
      paused: s.past_due,
    },
  },
  providers: providers.catalog.map((entry) => {
    const route = providers.routes[entry.key as keyof typeof providers.routes];
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
