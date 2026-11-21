import ipaddr from 'ipaddr.js';
import { z } from 'zod';
import type { Context } from 'hono';
import { policy, type ServiceConfig } from '../config.ts';
import type { TurnstileAction } from '../config/turnstile.ts';
import { ApiError } from '../errors.ts';
import { failureFacts, getLogger } from '../logging.ts';
import { trustedClientIdentity } from './client-identity.ts';

const cfg = policy.auth.turnstile;
const logger = getLogger('app.auth');

export const turnstileTokenSchema = z.string().max(cfg.token_max_length).optional().default('');

const siteverifySchema = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  action: z.string().optional(),
});

function refused(): ApiError {
  return new ApiError(403, 'Complete the verification check, then try again.', {
    code: 'human_verification_failed',
    retryable: false,
  });
}

function unavailable(): ApiError {
  return new ApiError(503, 'Verification is unavailable right now. Try again shortly.', {
    code: 'human_verification_unavailable',
  });
}

async function siteverify(
  config: ServiceConfig,
  input: { secret: string; token: string; action: string; ip: string | undefined },
): Promise<boolean> {
  let response: Response;
  try {
    response = await (config.auth.fetch ?? fetch)(cfg.verify_url, {
      method: 'POST',
      body: new URLSearchParams({
        secret: input.secret,
        response: input.token,
        ...(input.ip ? { remoteip: input.ip } : {}),
      }),
      signal: AbortSignal.timeout(cfg.verify_timeout_ms),
    });
  } catch (error) {
    logger.warning('auth.turnstile_unreachable', { action: input.action, ...failureFacts(error) });
    throw unavailable();
  }
  const parsed = response.ok
    ? siteverifySchema.safeParse(await response.json().catch(() => null))
    : null;
  if (!parsed?.success) {
    logger.warning('auth.turnstile_unreadable', { action: input.action, status: response.status });
    throw unavailable();
  }
  const appHost = new URL(config.auth.frontendUrl).hostname.toLowerCase();
  return (
    parsed.data.success &&
    parsed.data.action === input.action &&
    parsed.data.hostname?.toLowerCase() === appHost
  );
}

export async function requireHumanVerification(
  c: Context,
  config: ServiceConfig,
  input: { token: string; action: TurnstileAction },
): Promise<void> {
  const { secret, testKeysAllowed } = config.auth.turnstile;
  const testOutcome = cfg.test_secrets.get(secret);
  if (!secret || (testOutcome && !testKeysAllowed)) {
    logger.error('auth.turnstile_unconfigured', { action: input.action });
    throw unavailable();
  }
  if (!input.token || input.token.length > cfg.token_max_length) throw refused();
  if (testOutcome) {
    if (testOutcome === 'pass' && input.token === cfg.test_token) return;
    throw refused();
  }
  const client = trustedClientIdentity(c, config);
  const verified = await siteverify(config, {
    secret,
    token: input.token,
    action: cfg.actions[input.action],
    ip: ipaddr.isValid(client) ? client : undefined,
  });
  if (!verified) throw refused();
}
