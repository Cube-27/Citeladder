import { capabilityRemaining } from '@/lib/billing/entitlement-capability';
import { useEntitlement } from '@/lib/billing/entitlement-context';
import { PROJECT_SLOTS_CAPABILITY } from '@/lib/config/billing';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';

export function useProjectCreation() {
  const { activeWorkspaceId, isError } = useProjectContext();
  const { entitlement } = useEntitlement();
  const remainingProjectSlots = capabilityRemaining(entitlement, PROJECT_SLOTS_CAPABILITY);
  const mayCreate = useWorkspaceCapability('write');
  const canAddProject =
    !isError && mayCreate && remainingProjectSlots !== undefined && remainingProjectSlots > 0;
  return { activeWorkspaceId, mayCreate, canAddProject, remainingProjectSlots };
}
