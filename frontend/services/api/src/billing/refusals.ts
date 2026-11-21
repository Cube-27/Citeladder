import type { ApiErrorCode } from '@citeladder/contracts/error-codes';

import { conflict } from '../errors.ts';

const REFUSALS = {
  account_outside_campaign_cohort: 'This account is not eligible for this offer.',
  addon_pending: 'A payment for this add-on is already in progress. Refresh its status.',
  base_subscription_required: 'Subscribe to a plan before buying this.',
  billing_account_unavailable: 'This workspace has no billing account.',
  billing_gstin_state_mismatch:
    'The GSTIN does not match the selected state. Check both and try again.',
  campaign_disabled: 'This offer is not available.',
  campaign_ended: 'This offer has ended.',
  campaign_identity_changed: 'This offer has changed. Review it again before claiming.',
  campaign_not_started: 'This offer has not started yet.',
  cancellation_already_sent: 'The cancellation has already been sent to the payment provider.',
  catalog_key_unknown: 'This item is no longer offered. Please select it again.',
  catalog_revision_mismatch: 'The catalog changed after this quote. Review the quote again.',
  checkout_unavailable: 'Checkout is not available for this purchase yet.',
  contact_only: 'Contact sales to buy this plan.',
  credit_note_amount_invalid: 'The refund amount is not valid for this payment.',
  credit_note_tax_invalid: 'The refund tax does not match the original receipt.',
  explicit_consent_required: 'Accept the terms and data sharing to claim this offer.',
  grant_bundle_missing: 'This purchase has no access to grant.',
  idempotency_key_reused:
    'This request key was already used for a different purchase. Start the purchase again.',
  introductory_access_cannot_stack: 'Introductory access cannot be combined with an existing plan.',
  introductory_access_not_found: 'This workspace has no introductory access.',
  invoice_customer_email_missing: 'The invoice has no customer email.',
  invoice_number_too_long: 'The invoice number is too long.',
  invoice_prefix_invalid: 'The invoice prefix must be one to three capital letters or digits.',
  item_plan_ineligible: 'Your current plan cannot buy this item.',
  lifetime_introduction_consumed: 'This account has already used its introductory access.',
  no_current_subscription: 'This workspace has no active subscription.',
  oauth_verified_work_email_required: 'Sign in with a verified work email to claim this offer.',
  operator_code_invalid: 'That access code is not valid.',
  payment_amount_mismatch: 'The payment amount does not match the quote.',
  payment_for_closed_intent: 'This payment arrived for a checkout that is already closed.',
  payment_receipt_conflict: 'This payment already has a different receipt.',
  plan_change_pending: 'A plan change is already in progress. Refresh its status.',
  plan_change_same_plan: 'This workspace is already on that plan.',
  plan_change_unavailable: 'That plan change is not available.',
  price_ref_mismatch: 'The payment provider price does not match the catalog.',
  provider_identity_mismatch: 'The payment provider record belongs to another account.',
  provider_record_kind_mismatch: 'The payment provider record is for a different kind of purchase.',
  provider_reference_mismatch: 'The payment provider reference does not match this purchase.',
  provider_unavailable: 'This item cannot be bought right now.',
  quantity_out_of_bounds: 'That quantity is not available for this item.',
  refund_amount_exceeds_payment: 'The refunds exceed the amount paid.',
  refund_payment_missing: 'The refunded payment was not found.',
  refund_receipt_conflict: 'This refund already has a different credit note.',
  subscription_already_active: 'This workspace already has an active subscription.',
  subscription_payment_mismatch: 'The payment does not match this subscription.',
  subscription_pending: 'A subscription payment is already in progress. Refresh its status.',
  subscription_period_bounds_invalid: 'The subscription period is not valid.',
  subscription_period_overlap: 'The subscription period overlaps an existing one.',
} as const satisfies Partial<Record<ApiErrorCode, string>>;

export type BillingRefusal = keyof typeof REFUSALS;

export function refuse(reason: BillingRefusal): never {
  return conflict(reason, REFUSALS[reason]);
}
