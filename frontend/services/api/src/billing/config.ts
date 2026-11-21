import type { ProviderMode } from '@citeladder/contracts/billing';
import api from '../config/api.json' with { type: 'json' };
import authRuntime from '../config/auth-runtime.json' with { type: 'json' };
import { billing } from '../config/billing.ts';
import { ConfigError } from '../config/config-error.ts';
import {
  choiceSetting,
  dateSetting,
  nullableTextSetting,
  resolveSettingSpec,
  type SettingSource,
} from '../config/settings.ts';

const policy = {
  billing,
  development_env_names: api.development_env_names,
  settings: { ...api.settings, ...authRuntime.settings },
};

export function catalogBootstrapSettings(env: SettingSource = process.env) {
  const setting = (key: 'app_env' | 'demo_mode' | 'dev_login_email' | 'dev_login_password') =>
    resolveSettingSpec(policy.settings[key], env);
  const development = policy.development_env_names.includes(
    String(setting('app_env')).trim().toLowerCase(),
  );
  return {
    skip:
      Boolean(setting('demo_mode')) ||
      (development && !String(setting('dev_login_password')).trim()),
    actor: String(setting('dev_login_email')).trim().toLowerCase(),
  };
}

export function billingSettings(env: SettingSource = process.env) {
  const specs = policy.billing.settings;
  const get = <K extends keyof typeof specs>(key: K) => resolveSettingSpec(specs[key], env);
  let contactUrl: URL;
  try {
    contactUrl = new URL(String(get('contact_sales_url')));
  } catch {
    throw new ConfigError('Billing contact URL must be an absolute HTTP(S) URL');
  }
  if (!['http:', 'https:'].includes(contactUrl.protocol))
    throw new ConfigError('Billing contact URL must be an absolute HTTP(S) URL');
  const sellerEmail = get('seller_email').trim();
  if (sellerEmail && !/^[^@\s]+@[^@.\s]+(?:\.[^@.\s]+)+$/u.test(sellerEmail))
    throw new ConfigError('seller_email must be an email address');
  const audience = get('checkout_audience').trim().toLowerCase();
  if (audience !== 'allow_list' && audience !== 'everyone')
    throw new ConfigError('checkout_audience must be allow_list or everyone');
  const invoicePrefix = get('invoice_prefix').trim().toUpperCase();
  if (!/^[A-Z0-9]{1,3}$/u.test(invoicePrefix))
    throw new ConfigError('invoice_prefix must be 1-3 uppercase letters or digits');
  return {
    enabled: get('checkout_enabled'),
    audience: audience satisfies 'allow_list' | 'everyone',
    provider: get('checkout_provider'),
    quoteSecret: get('quote_signing_secret'),
    quoteMinutes: get('quote_validity_minutes'),
    timeoutMs: get('request_timeout_seconds') * 1000,
    cycles: get('subscription_total_cycles'),
    minimumUpgrade: get('plan_change_minimum_charge_minor'),
    webhookBytes: get('max_webhook_body_bytes'),
    webhookLeaseSeconds: get('webhook_lease_seconds'),
    webhookAttempts: get('webhook_max_attempts'),
    leaseSeconds: get('reconciliation_lease_seconds'),
    batchSize: get('reconciliation_batch_size'),
    staleSeconds: get('reconciliation_stale_after_seconds'),
    abandonSeconds: get('reconciliation_abandon_after_seconds'),
    skewSeconds: get('reconciliation_clock_skew_seconds'),
    cancellationLeadSeconds: get('cancellation_send_lead_seconds'),
    attempts: get('reconciliation_max_attempts'),
    backoffSeconds: get('reconciliation_backoff_base_seconds'),
    listCount: get('reconciliation_list_count'),
    maxPages: get('reconciliation_max_pages'),
    contactUrl: contactUrl.href,
    trialDays: get('trial_days'),
    gstRate: nullableTextSetting(specs.india_gst_rate, env),
    seller: {
      legal_name: get('seller_legal_name'),
      address: get('seller_legal_address'),
      email: sellerEmail,
      gstin: get('seller_gstin'),
      state_code: get('seller_gst_state_code'),
      state_name: get('seller_gst_state_name'),
      sac: get('seller_sac'),
      lut_reference: get('seller_lut_reference'),
      invoice_prefix: invoicePrefix,
      gst_approval_reference: get('india_gst_approval_reference'),
    },
  };
}
export type BillingSettings = ReturnType<typeof billingSettings>;

export function razorpaySettings(env: SettingSource = process.env) {
  const specs = policy.billing.razorpay_settings;
  const get = <K extends keyof typeof specs>(key: K) => resolveSettingSpec(specs[key], env);
  const canonicalId = get('key_id');
  const canonicalSecret = get('key_secret');
  const aliasId = get('test_key_id_alias');
  const aliasSecret = get('test_key_secret_alias');
  const mode: 'disabled' | ProviderMode = choiceSetting(specs.mode, env, [
    'disabled',
    'test',
    'live',
  ]);
  const conflicting =
    (canonicalId && aliasId && canonicalId !== aliasId) ||
    (canonicalSecret && aliasSecret && canonicalSecret !== aliasSecret) ||
    (mode !== 'test' && (aliasId || aliasSecret));
  return {
    mode,
    keyId: canonicalId || aliasId,
    keySecret: canonicalSecret || aliasSecret,
    webhookSecret: get('webhook_secret'),
    previousSecret: get('webhook_previous_secret'),
    previousStart: dateSetting(specs.webhook_previous_secret_started_at, env),
    previousEnd: dateSetting(specs.webhook_previous_secret_expires_at, env),
    origin: get('api_base_url'),
    production: resolveSettingSpec(policy.settings.app_env, env) === 'production',
    ready: mode === 'test' ? get('test_ready') : get('live_ready'),
    indiaReady: get('test_india_ready'),
    internationalReady:
      mode === 'test' ? get('test_international_ready') : get('international_ready'),
    conflicting: Boolean(conflicting),
  };
}
export type RazorpaySettings = ReturnType<typeof razorpaySettings>;
