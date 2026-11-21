import type { WorkspaceEntitlement } from '@/lib/api/billing';

export function capabilityRemaining(
  entitlement: WorkspaceEntitlement | null,
  key: string,
): number | undefined {
  if (entitlement?.status !== 'resolved') return undefined;
  const hint = entitlement.occupancy.find((candidate) => candidate.key === key);
  return hint?.remaining;
}
