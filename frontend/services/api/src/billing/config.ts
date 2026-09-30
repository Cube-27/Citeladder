import { policy, resolveSettingSpec } from '../config.ts';

/** Resolve exported policy; tests pass a deterministic environment. */
export function billingSettings(env: Record<string, string | undefined> = process.env) {
  const specs = policy.billing.settings;
  const get = <K extends keyof typeof specs>(key: K) => resolveSettingSpec(specs[key], env);
  return {
    enabled: get('checkout_enabled') as boolean,
    provider: get('checkout_provider') as string,
    quoteSecret: get('quote_signing_secret') as string,
    quoteMinutes: get('quote_validity_minutes') as number,
    timeoutMs: (get('request_timeout_seconds') as number) * 1000,
    cycles: get('subscription_total_cycles') as number,
    minimumUpgrade: get('plan_change_minimum_charge_minor') as number,
    webhookBytes: get('max_webhook_body_bytes') as number,
    webhookLeaseSeconds: get('webhook_lease_seconds') as number,
    webhookAttempts: get('webhook_max_attempts') as number,
    leaseSeconds: get('reconciliation_lease_seconds') as number,
    batchSize: get('reconciliation_batch_size') as number,
    pollSeconds: get('reconciliation_poll_seconds') as number,
    staleSeconds: get('reconciliation_stale_after_seconds') as number,
    abandonSeconds: get('reconciliation_abandon_after_seconds') as number,
    attempts: get('reconciliation_max_attempts') as number,
    backoffSeconds: get('reconciliation_backoff_base_seconds') as number,
    listCount: get('reconciliation_list_count') as number,
    maxPages: get('reconciliation_max_pages') as number,
    contactUrl: get('contact_sales_url') as string,
    trialDays: get('trial_days') as number,
    gstRate: get('india_gst_rate') as string | null,
    seller: {
      legal_name: get('seller_legal_name') as string,
      address: get('seller_legal_address') as string,
      email: get('seller_email') as string,
      gstin: get('seller_gstin') as string,
      state_code: get('seller_gst_state_code') as string,
      state_name: get('seller_gst_state_name') as string,
      sac: get('seller_sac') as string,
      lut_reference: get('seller_lut_reference') as string,
      invoice_prefix: get('invoice_prefix') as string,
      gst_approval_reference: get('india_gst_approval_reference') as string,
    },
  };
}
export type BillingSettings = ReturnType<typeof billingSettings>;

export function razorpaySettings(env: Record<string, string | undefined> = process.env) {
  const specs = policy.billing.razorpay_settings;
  const get = <K extends keyof typeof specs>(key: K) => resolveSettingSpec(specs[key], env);
  const canonicalId = get('key_id') as string;
  const canonicalSecret = get('key_secret') as string;
  const aliasId = get('test_key_id_alias') as string;
  const aliasSecret = get('test_key_secret_alias') as string;
  const mode = get('mode') as 'disabled' | 'test' | 'live';
  const conflicting =
    (canonicalId && aliasId && canonicalId !== aliasId) ||
    (canonicalSecret && aliasSecret && canonicalSecret !== aliasSecret) ||
    (mode !== 'test' && (aliasId || aliasSecret));
  return {
    mode,
    keyId: canonicalId || aliasId,
    keySecret: canonicalSecret || aliasSecret,
    webhookSecret: get('webhook_secret') as string,
    previousSecret: get('webhook_previous_secret') as string,
    previousStart: get('webhook_previous_secret_started_at') as Date | null,
    previousEnd: get('webhook_previous_secret_expires_at') as Date | null,
    origin: get('api_base_url') as string,
    production: ['prod', 'production'].includes((get('deployment_env') as string).toLowerCase()),
    ready: mode === 'test' ? (get('test_ready') as boolean) : (get('live_ready') as boolean),
    indiaReady: get('test_india_ready') as boolean,
    internationalReady:
      mode === 'test'
        ? (get('test_international_ready') as boolean)
        : (get('international_ready') as boolean),
    conflicting: Boolean(conflicting),
  };
}
export type RazorpaySettings = ReturnType<typeof razorpaySettings>;
