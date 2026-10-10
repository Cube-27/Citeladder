import { z } from 'zod';
import { TURNSTILE_VERIFY_TIMEOUT_MS, TURNSTILE_VERIFY_URL } from '@/lib/config/turnstile';

const siteverifySchema = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  action: z.string().optional(),
});

export type TurnstileCheck = {
  secret: string;
  token: string;
  ip: string;
  action: string;
  /** Frontend hostnames the widget may be solved on. */
  hostnames: readonly string[];
};

/** Hostnames from a comma-separated Worker variable. */
export function turnstileHostnames(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * True only when Cloudflare confirms the token was solved for this action on
 * an allowed hostname. Tokens are single-use, so a replay fails here.
 */
export async function verifyTurnstile(check: TurnstileCheck): Promise<boolean> {
  if (!check.token) return false;
  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: new URLSearchParams({
        secret: check.secret,
        response: check.token,
        remoteip: check.ip,
      }),
      signal: AbortSignal.timeout(TURNSTILE_VERIFY_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const result = siteverifySchema.safeParse(await response.json());
    return (
      result.success &&
      result.data.success &&
      result.data.action === check.action &&
      check.hostnames.includes(result.data.hostname?.toLowerCase() ?? '')
    );
  } catch {
    return false;
  }
}
