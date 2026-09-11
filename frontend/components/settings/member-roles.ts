import { ASSIGNABLE_WORKSPACE_ROLES } from '@/lib/api/workspaces';

/** The roles a control may offer. `owner` is never among them. */
export const ROLE_OPTIONS = ASSIGNABLE_WORKSPACE_ROLES.map((role) => ({
  value: role,
  label: role.charAt(0).toUpperCase() + role.slice(1),
}));

/** One plain sentence per role, matching the backend's one policy. */
export const ROLE_SUMMARY: Record<string, string> = {
  owner: 'Full access, including billing and members. One per workspace.',
  admin: 'The same access as the owner, including billing and members.',
  member: 'Everything except billing and member management.',
  viewer: 'Read-only.',
};
