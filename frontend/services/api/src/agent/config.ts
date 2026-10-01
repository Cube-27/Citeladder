import { fileURLToPath } from 'node:url';
import { policy, resolveSettingSpec } from '../config.ts';

export function agentSettings(env: Record<string, string | undefined> = process.env) {
  const specs = policy.models.gateway;
  const setting = (name: keyof typeof specs) => resolveSettingSpec(specs[name], env);
  return {
    skillsDirectory:
      env.AGENT_SKILLS_DIRECTORY ||
      fileURLToPath(
        new URL('../../../../../backend/app/core/config/agent_skills/', import.meta.url),
      ),
    executionTimeoutSeconds: Number(setting('execution_timeout_seconds')),
    leaseMarginSeconds: Number(setting('lease_margin_seconds')),
    retryBaseSeconds: Number(setting('retry_base_delay_seconds')),
    retryMaxSeconds: Number(setting('retry_max_delay_seconds')),
    devEmail: String(resolveSettingSpec(policy.settings.dev_login_email, env)).trim().toLowerCase(),
    devPasswordConfigured: Boolean(resolveSettingSpec(policy.settings.dev_login_password, env)),
    activeLimit: Number(resolveSettingSpec(policy.abuse.active_agent_runs_per_workspace, env)),
    dailyLimit: Number(resolveSettingSpec(policy.abuse.agent_runs_per_workspace_daily, env)),
    retryAfterSeconds: Number(resolveSettingSpec(policy.abuse.active_job_retry_after_seconds, env)),
  };
}
