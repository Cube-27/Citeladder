import { ASSIGNABLE_WORKSPACE_ROLES } from '@/lib/api/workspaces';
import { sentenceCaseStatus } from '@/lib/utils';

export const roleLabel = sentenceCaseStatus;

export const ROLE_OPTIONS = ASSIGNABLE_WORKSPACE_ROLES.map((role) => ({
  value: role,
  label: roleLabel(role),
}));

export const ROLE_SUMMARY: Record<string, string> = {
  owner: 'Full access, including billing, members and ownership transfer.',
  admin: 'Everything the owner can do except hand over ownership.',
  member: 'Works in projects. No billing, members, integrations or project deletion.',
  viewer: 'Read-only.',
};
