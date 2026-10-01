import { policy, resolveSettingSpec } from '../config.ts';

export const providerPolicy = policy.providers;
export type Engine = keyof typeof providerPolicy.routes;
export type ProviderTransport = 'openai' | 'google' | 'anthropic' | 'dataforseo';

export function providerSettings(env: Record<string, string | undefined> = process.env) {
  const spec = providerPolicy.settings;
  return {
    endpoints: {
      openai: String(resolveSettingSpec(spec.openai_responses_url, env)),
      google: String(resolveSettingSpec(spec.google_interactions_url, env)),
      anthropic: String(resolveSettingSpec(spec.anthropic_messages_url, env)),
      dataforseo: String(resolveSettingSpec(providerPolicy.dataforseo.base_url, env)),
    },
    timeoutSeconds: Number(resolveSettingSpec(spec.test_timeout_seconds, env)),
    outputTokens: Number(resolveSettingSpec(spec.test_max_output_tokens, env)),
    anthropicVersion: String(resolveSettingSpec(spec.anthropic_version, env)),
    dataforseoTimeout: Number(resolveSettingSpec(providerPolicy.dataforseo.test_timeout_seconds, env)),
  };
}
export type ProviderSettings = ReturnType<typeof providerSettings>;
