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
import type { Workspace } from '@citeladder/contracts';
import { workspaceDestination } from '@/lib/navigation/project-destination';
import { PROJECT_SLOTS_CAPABILITY } from '@/lib/config/billing';
import { capabilityRemaining } from '@/lib/billing/entitlement-capability';
import type { SelectionStatus } from '@/lib/project/selection';
import { routePath } from '@/lib/navigation/route-path';

/** The sign-in workspace chooser. */
export const WORKSPACE_CHOOSER_PATH = '/workspaces';
/** Onboarding's step that creates the person's own workspace. */
export const WORKSPACE_SETUP_PATH = '/onboarding?setup=workspace';

/** Whether the person owns one of these workspaces (a person owns at most one). */
export function ownsWorkspace(workspaces: readonly { role: string }[]): boolean {
  return workspaces.some((workspace) => workspace.role === 'owner');
}

/**
 * The chooser's only destination, when it has one: the workspace a person owns
 * when it is the only one they belong to. Anyone invited elsewhere, or owning
 * none, chooses.
 */
function soleOwnedWorkspace<T extends { role: string }>(workspaces: readonly T[]): T | undefined {
  const [only, ...others] = workspaces;
  return only?.role === 'owner' && others.length === 0 ? only : undefined;
}

/**
 * Where the chooser goes without asking, decided by the route loader before
 * it paints; null when the person has a choice to make.
 *
 * Sign-in lands on the chooser. Deciding there, in an effect, meant a fresh
 * document drew the chooser's loader, read the workspace's projects, access
 * and Terms one batch at a time, and only then moved on, discarding what the
 * shell then asked for again. Answered by the loader instead, the same
 * document goes on while the shell fallback is still up: someone with no
 * workspace to set one up, and someone whose only workspace is their own into
 * it, where the loader reads its gates in one round and picks the project.
 * A failed membership read (`undefined`) is left to the chooser, which owns
 * that notice.
 */
export function chooserShortcut(
  pathname: string,
  workspaces: readonly Workspace[] | undefined,
): string | null {
  if (routePath(pathname) !== WORKSPACE_CHOOSER_PATH || !workspaces) return null;
  if (workspaces.length === 0) return WORKSPACE_SETUP_PATH;
  const only = soleOwnedWorkspace(workspaces);
  return only ? workspaceDestination('/projects', null, only.id) : null;
}

/**
 * Routes that act on the person rather than on the selected workspace: the
 * chooser, and setting up their own workspace. Neither waits for the selected
 * workspace's access or Terms, which may be exactly what the person is
 * leaving.
 */
export function isWorkspaceFreeRoute(pathname: string, search: string): boolean {
  const path = routePath(pathname);
  if (path === WORKSPACE_CHOOSER_PATH) return true;
  return path === '/onboarding' && new URLSearchParams(search).get('setup') === 'workspace';
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
  if (status === 'no_workspace') return 'redirecting';
  if (status === 'resolving') return 'loading';
  if (status !== 'empty') return 'ready';
  if (mayCreate && allowance === 'spare') return 'redirecting';
  if (entitlementLoading) return 'loading';
  // An unread allowance cannot justify claiming that the workspace is full.
  return allowance === 'unknown' ? 'failed' : 'no-projects';
}
