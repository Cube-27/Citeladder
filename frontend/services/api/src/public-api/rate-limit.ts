/**
 * The public API's per-key and per-workspace request windows, reported as the
 * IETF draft RateLimit fields (draft-ietf-httpapi-ratelimit-headers):
 * `RateLimit-Policy` names each window's quota (`q`) and length (`w`);
 * `RateLimit` gives what remains (`r`) and the seconds until it resets (`t`).
 */
import { budget, spendBudgetState, type Budget } from '../abuse/usage.ts';
import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';

const WINDOWS = [
  { name: 'key', budget: budget('public_api_key') },
  { name: 'workspace', budget: budget('public_api_workspace') },
] as const satisfies readonly { name: string; budget: Budget }[];

const POLICY = WINDOWS.map(
  ({ name, budget: { limit, windowSeconds } }) => `"${name}";q=${limit};w=${windowSeconds}`,
).join(', ');

/**
 * Spend one request from the key's and the workspace's windows and return the
 * RateLimit fields; over a limit, the 429 carries them with `r=0`.
 */
export async function spendRateLimits(
  db: Database,
  key: { id: string; workspace_id: string },
): Promise<Record<string, string>> {
  const subjects = { key: key.id, workspace: key.workspace_id };
  const remaining: string[] = [];
  for (const window of WINDOWS) {
    try {
      const state = await spendBudgetState(db, window.budget, subjects[window.name]);
      remaining.push(`"${window.name}";r=${state.remaining};t=${state.resetSeconds}`);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 429) throw error;
      throw new ApiError(429, error.message, {
        code: error.code,
        headers: {
          ...error.headers,
          'RateLimit-Policy': POLICY,
          RateLimit: `"${window.name}";r=0;t=${error.headers?.['retry-after'] ?? 1}`,
        },
      });
    }
  }
  return { 'RateLimit-Policy': POLICY, RateLimit: remaining.join(', ') };
}
