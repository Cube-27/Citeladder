import { ConfigError, policy, resolveSettingSpec } from '../config.ts';
export const auditPolicy = policy.audits;
/** Admission resolves policy once. Workers read the persisted copy for measurement behavior. */
export function auditSettings(env: Record<string, string | undefined> = process.env) {
  const settings = Object.fromEntries(
    Object.entries(auditPolicy.settings).map(([name, spec]) => [
      name,
      Number(resolveSettingSpec(spec, env)),
    ]),
  ) as Record<keyof typeof auditPolicy.settings, number>;
  const count = resolveSettingSpec(auditPolicy.prompt_count, env);
  const promptCount = count == null ? null : Number(count);
  if (
    promptCount !== null &&
    (!/^\+?\d+$/u.test(String(count).trim()) || !Number.isSafeInteger(promptCount))
  )
    throw new ConfigError('Audit prompt count must be a nonnegative integer');
  return { ...settings, audit_prompt_count: promptCount };
}
