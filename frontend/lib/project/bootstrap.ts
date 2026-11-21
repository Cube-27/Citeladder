import type { WorkspaceEntitlement } from '@/lib/api/billing';
import type { Workspace } from '@citeladder/contracts';
import { workspaceDestination } from '@/lib/navigation/project-destination';
import { PROJECT_SLOTS_CAPABILITY } from '@/lib/config/billing';
import { capabilityRemaining } from '@/lib/billing/entitlement-capability';
import type { SelectionStatus } from '@/lib/project/selection';
import { routePath } from '@/lib/navigation/route-path';

export const WORKSPACE_CHOOSER_PATH = '/workspaces';
export const WORKSPACE_SETUP_PATH = '/onboarding?setup=workspace';

export function ownsWorkspace(workspaces: readonly { role: string }[]): boolean {
  return workspaces.some((workspace) => workspace.role === 'owner');
}

function soleOwnedWorkspace<T extends { role: string }>(workspaces: readonly T[]): T | undefined {
  const [only, ...others] = workspaces;
  return only?.role === 'owner' && others.length === 0 ? only : undefined;
}

export function chooserShortcut(
  pathname: string,
  workspaces: readonly Workspace[] | undefined,
): string | null {
  if (routePath(pathname) !== WORKSPACE_CHOOSER_PATH || !workspaces) return null;
  if (workspaces.length === 0) return WORKSPACE_SETUP_PATH;
  const only = soleOwnedWorkspace(workspaces);
  return only ? workspaceDestination('/projects', null, only.id) : null;
}

export function isWorkspaceFreeRoute(pathname: string, search: string): boolean {
  const path = routePath(pathname);
  if (path === WORKSPACE_CHOOSER_PATH) return true;
  return path === '/onboarding' && new URLSearchParams(search).get('setup') === 'workspace';
}

export type Allowance = 'unknown' | 'spent' | 'spare';

export function resolveAllowance(entitlement: WorkspaceEntitlement | null): Allowance {
  const remaining = capabilityRemaining(entitlement, PROJECT_SLOTS_CAPABILITY);
  if (remaining === undefined) return 'unknown';
  return remaining > 0 ? 'spare' : 'spent';
}

export type NoticeKind = 'failed' | 'missing-project' | 'no-projects';
export type GateState = NoticeKind | 'ready' | 'loading' | 'redirecting';

export type GateInputs = {
  projectRequired: boolean;
  mayCreate: boolean;
  allowance: Allowance;
  entitlementLoading: boolean;
};

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
  return allowance === 'unknown' ? 'failed' : 'no-projects';
}
