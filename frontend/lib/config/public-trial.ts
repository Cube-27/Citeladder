import { settings } from '@/services/api/src/config/billing.json';
import { public_trial } from '@/services/api/src/config/entitlements.json';

export const PUBLIC_TRIAL = {
  days: settings.trial_days.default,
  projects: public_trial.grants.project_slots,
  prompts: public_trial.grants.prompt_slots,
  monitoredUrls: public_trial.grants.monitored_urls,
  answers: public_trial.grants.prompt_runs_per_period,
  aiCredits: public_trial.grants.ai_credits,
} as const;

export type PublicTrial = Readonly<Record<keyof typeof PUBLIC_TRIAL, number>>;
