/**
 * Read one capability's remaining allowance off a workspace entitlement.
 *
 * Its own module because the shell's opening decision needs it before React
 * exists — `lib/project/bootstrap.ts` is called from a route loader — and
 * `entitlement-context` cannot be imported there without dragging the provider
 * and its hooks along.
 */
import type { WorkspaceEntitlement } from '@/lib/api/billing';

/**
 * How much of one occupancy allowance is left in the active workspace.
 *
 * Reads the MEMBER-SAFE hints on the workspace entitlement rather than the
 * owner-private usage report, so a Member sees the same "no slots left" state
 * an Owner does without being shown the workspace's finances. `undefined`
 * means "not answerable yet", which is not the same as zero — callers must
 * not treat it as a denial.
 */
export function capabilityRemaining(
  entitlement: WorkspaceEntitlement | null,
  key: string,
): number | undefined {
  if (entitlement?.status !== 'resolved') return undefined;
  const hint = entitlement.occupancy.find((candidate) => candidate.key === key);
  return hint?.remaining;
}
