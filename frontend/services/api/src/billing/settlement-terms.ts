import { z } from 'zod';
import {
  credentialModeSchema,
  currencySchema,
  resolvedQuoteSchema,
} from '@citeladder/contracts/billing';
import { refuse } from './refusals.ts';
import { amount, taxSnapshotSchema, type Pending, type Subscription } from './contracts.ts';
import type { Evidence, SubscriptionEvidence } from './razorpay.ts';
import { policy } from '../config.ts';

export const frozenTermsSchema = z.object({
  catalog_key: z.string(),
  catalog_revision: z.string(),
  credential_mode: credentialModeSchema,
  quantity: amount.min(1),
  price_ref: z.string(),
  currency: currencySchema,
  quote: resolvedQuoteSchema,
  tax_snapshot: taxSnapshotSchema,
  grant_specs: z.array(z.tuple([z.string(), amount])),
});
export const scheduledSchema = z.object({
  direction: z.enum(['upgrade', 'downgrade']),
  state: z.enum(['requested', 'scheduled', 'provider_rejected']),
  catalog_key: z.string(),
  effective_at: z.string(),
  source: z.string(),
  terms: frozenTermsSchema,
});
export const STATUS = policy.billing.subscription_status;
export const grantedStates = new Set<string>([STATUS.active, STATUS.cancel_scheduled]);
export const terminalStates = new Set(policy.billing.contracts.terminal_subscription_statuses);

export function verifiedReference(pending: Pending, mode: string, evidence: Evidence) {
  if (pending.provider !== 'razorpay' || pending.provider_mode !== mode)
    refuse('provider_identity_mismatch');
  const ref = evidence.kind === 'base' ? evidence.subscription.id : evidence.reference;
  const notes = evidence.kind === 'base' ? evidence.subscription.notes : evidence.notes;
  const differs = (value: string | undefined, expected: string) =>
    Boolean(value) && value !== expected;
  if (
    pending.external_reference !== ref ||
    differs(notes.citeladder_intent_id, pending.id) ||
    differs(notes.citeladder_account_ref, pending.billing_account_id) ||
    differs(notes.citeladder_catalog_revision, pending.catalog_revision)
  )
    refuse('provider_reference_mismatch');
  return ref;
}

export function providerFailed(evidence: Evidence) {
  return (
    evidence.kind === 'base' &&
    !evidence.subscription.payment &&
    terminalStates.has(evidence.subscription.status)
  );
}

export function refundCancelled(sub: Pick<Subscription, 'is_current' | 'status'>) {
  return sub.is_current && sub.status === STATUS.cancelled;
}

export function effectiveTerms(sub: Subscription, event: SubscriptionEvidence) {
  const terms = frozenTermsSchema.parse(sub.frozen_terms);
  const change = sub.scheduled_change ? scheduledSchema.parse(sub.scheduled_change) : null;
  const due = Boolean(change && event.start && event.start >= new Date(change.effective_at));
  if (change && due && event.priceRef === change.terms.price_ref)
    return { terms: change.terms, renewal: true, lapsed: false };
  return { terms, renewal: false, lapsed: due && change?.state === 'provider_rejected' };
}

export function followUps(
  sub: Subscription,
  event: SubscriptionEvidence,
  status: string,
  now: Date,
) {
  return {
    ...(event.cancelAtEnd && !sub.cancellation_sent_at ? { cancellation_sent_at: now } : {}),
    ...(status === STATUS.unpaid || (status === STATUS.cancelled && !event.cancelAtEnd)
      ? { reconciliation_next_at: now }
      : {}),
  };
}

export function renewedTerms(terms: {
  catalog_key: string;
  catalog_revision: string;
  price_ref: string;
}) {
  return {
    catalog_key: terms.catalog_key,
    catalog_revision: terms.catalog_revision,
    external_price_id: terms.price_ref,
    frozen_terms: JSON.stringify(terms),
    scheduled_change: null,
  };
}
