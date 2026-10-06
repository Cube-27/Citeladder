/**
 * The authenticated shell's opening decision, in one place.
 *
 * Which workspace, which project, and whether this route can render at all —
 * asked once, before the first paint, by `PrivateRouteLayout`'s loader, and
 * asked again on every later render by `OnboardingGate`. Both ask the same
 * question, so both call the same function; the alternative is two copies of a
 * precedence table that took a long time to get right.
 *
 * Nothing here fetches or navigates. It answers from whatever is known, and
 * the caller decides what to do about it — which is what lets the loader
 * redirect before anything mounts and the gate render a notice after.
 */
import type { WorkspaceEntitlement } from '@/lib/api/billing';
import { PROJECT_SLOTS_CAPABILITY } from '@/lib/config/billing';
import { capabilityRemaining } from '@/lib/billing/entitlement-capability';
import type { SelectionStatus } from '@/lib/project/selection';

/**
 * Routes that manage the WORKSPACE rather than work inside a project.
 *
 * A workspace with no projects is a perfectly valid workspace: its owner may
 * still need to reach billing, members and settings, and an invitee arriving
 * at an acceptance link has not joined anything yet. Redirecting these to
 * project creation answered a question nobody asked and made an empty
 * workspace unmanageable.
 */
const WORKSPACE_ONLY_PREFIXES = [
  '/onboarding',
  '/settings',
  '/billing',
  '/invitations',
  '/pricing',
] as const;

export function isWorkspaceOnlyRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return WORKSPACE_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * What the workspace's project allowance currently says.
 *
 * `unknown` covers a FAILED read as well as an unresolved one, even when a
 * stale positive value is still in the cache: sending someone into creation on
 * the strength of a number the server just refused to confirm is how a
 * transient failure turns into a rejected second attempt.
 */
export type Allowance = 'unknown' | 'spent' | 'spare';

export function resolveAllowance(entitlement: WorkspaceEntitlement | null): Allowance {
  const remaining = capabilityRemaining(entitlement, PROJECT_SLOTS_CAPABILITY);
  if (remaining === undefined) return 'unknown';
  return remaining > 0 ? 'spare' : 'spent';
}

/** Which standing notice, if any, this state owes the reader. */
export type NoticeKind = 'failed' | 'missing-project' | 'no-projects';
export type GateState = NoticeKind | 'ready' | 'loading' | 'redirecting';

export type GateInputs = {
  projectRequired: boolean;
  mayCreate: boolean;
  allowance: Allowance;
  entitlementLoading: boolean;
};

/** Resolve routing, loading and recovery together so their precedence cannot drift. */
export function resolveGate(
  status: SelectionStatus,
  { projectRequired, mayCreate, allowance, entitlementLoading }: GateInputs,
): GateState {
  if (status === 'error') return 'failed';
  if (status === 'unavailable') return 'missing-project';
  if (!projectRequired) return 'ready';
  if (status === 'resolving') return 'loading';
  if (status !== 'empty') return 'ready';
  if (mayCreate && allowance === 'spare') return 'redirecting';
  if (entitlementLoading) return 'loading';
  // An unread allowance cannot justify claiming that the workspace is full.
  return allowance === 'unknown' ? 'failed' : 'no-projects';
}
