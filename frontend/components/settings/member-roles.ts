import { ASSIGNABLE_WORKSPACE_ROLES } from '@/lib/api/workspaces';

/** A membership role as people read it: `admin` → `Admin`. */
export function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/** The roles a control may offer. `owner` is never among them. */
export const ROLE_OPTIONS = ASSIGNABLE_WORKSPACE_ROLES.map((role) => ({
  value: role,
  label: roleLabel(role),
}));

/** One plain sentence per role, matching the backend's one policy. */
export const ROLE_SUMMARY: Record<string, string> = {
  owner: 'Full access, including billing, members and handing ownership to someone else.',
  admin: 'Everything the owner can do except hand over ownership.',
  member: 'Works in projects. No billing, members, integrations or project deletion.',
  viewer: 'Read-only.',
};
