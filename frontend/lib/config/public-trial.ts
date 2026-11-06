/**
 * The public trial's published numbers, read from their config owners: the
 * API's `public_trial` entitlement grants and the billing trial length
 * default. Marketing copy interpolates these, so a config change cannot
 * leave the site quoting an old limit. Server-rendered code imports this;
 * a client island takes the numbers as a prop so the config files stay out
 * of browser bundles.
 */
import { settings } from '@/services/api/src/config/billing.json';
import { public_trial } from '@/services/api/src/config/entitlements.json';

export const PUBLIC_TRIAL = {
  days: settings.trial_days.default,
  projects: public_trial.grants.project_slots,
  prompts: public_trial.grants.prompt_slots,
  monitoredUrls: public_trial.grants.monitored_urls,
  /** Successful answers in the trial period. */
  answers: public_trial.grants.prompt_runs_per_period,
  aiCredits: public_trial.grants.ai_credits,
} as const;

export type PublicTrial = Readonly<Record<keyof typeof PUBLIC_TRIAL, number>>;
