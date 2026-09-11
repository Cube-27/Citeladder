/**
 * Workspace membership, invitation and product-tour endpoints (plan §2.4).
 *
 * Everything here except `acceptInvitation` is administrative: the server
 * refuses any role without `manage_members`, and these helpers exist so the
 * UI can hide controls it already knows would be refused — never as the
 * boundary itself.
 *
 * An issued or resent invitation returns its acceptance token ONCE. Only the
 * hash is stored, so no later read can hand it back; the caller delivers the
 * link and must not persist the token.
 *
 * Every helper that names a workspace in its path also SENDS that workspace on
 * the request. Without it the transport falls back to the mutable active
 * selection, so a retry issued after a workspace switch could carry one
 * workspace's path with another's `X-Workspace-Id`. `acceptInvitation` is the
 * deliberate exception: the acceptor is not a member of anything yet, and the
 * token is what names the workspace.
 */
import { z } from 'zod';

import { apiClient, type ApiRequestOptions } from './client';
import {
  productTourSchema,
  strictValidate,
  workspaceInvitationIssuedSchema,
  workspaceInvitationSchema,
  workspaceMemberSchema,
  workspaceSchema,
} from './schemas';
import type { ProductTour, ProductTourStatus, Workspace } from './types';

export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;
export type WorkspaceInvitation = z.infer<typeof workspaceInvitationSchema>;
export type WorkspaceInvitationIssued = z.infer<typeof workspaceInvitationIssuedSchema>;

/** The roles an invitation or a role change may name. Never `owner`. */
export const ASSIGNABLE_WORKSPACE_ROLES = ['admin', 'member', 'viewer'] as const;
export type AssignableWorkspaceRole = (typeof ASSIGNABLE_WORKSPACE_ROLES)[number];

const memberListSchema = z.array(workspaceMemberSchema);
const invitationListSchema = z.array(workspaceInvitationSchema);

export const workspacesApi = {
  getProductTour: async (workspaceId: string, options?: ApiRequestOptions) => {
    const response = await apiClient.get<ProductTour>(`/workspaces/${workspaceId}/product-tour`, {
      ...options,
      workspaceId,
    });
    return strictValidate(productTourSchema, response, 'workspaces.getProductTour');
  },
  updateProductTour: async (
    workspaceId: string,
    payload: { version: string; status: ProductTourStatus; step_id?: string | null },
    options?: ApiRequestOptions,
  ) => {
    const response = await apiClient.patch<ProductTour>(
      `/workspaces/${workspaceId}/product-tour`,
      payload,
      { ...options, workspaceId },
    );
    return strictValidate(productTourSchema, response, 'workspaces.updateProductTour');
  },
  listMembers: async (workspaceId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.get<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`, {
      ...options,
      workspaceId,
    });
    return strictValidate(memberListSchema, res, 'workspaces.listMembers');
  },
  updateMemberRole: async (
    workspaceId: string,
    memberId: string,
    role: AssignableWorkspaceRole,
    options?: ApiRequestOptions,
  ) => {
    const res = await apiClient.patch<WorkspaceMember>(
      `/workspaces/${workspaceId}/members/${memberId}`,
      { role },
      { ...options, workspaceId },
    );
    return strictValidate(workspaceMemberSchema, res, 'workspaces.updateMemberRole');
  },
  removeMember: (workspaceId: string, memberId: string, options?: ApiRequestOptions) =>
    apiClient.delete<void>(`/workspaces/${workspaceId}/members/${memberId}`, {
      ...options,
      workspaceId,
    }),
  /**
   * Move the Owner designation to another member. The caller becomes Admin in
   * the same transaction, so the workspace is never ownerless.
   */
  transferOwnership: async (workspaceId: string, memberId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.post<WorkspaceMember[]>(
      `/workspaces/${workspaceId}/ownership`,
      { member_id: memberId },
      { ...options, workspaceId },
    );
    return strictValidate(memberListSchema, res, 'workspaces.transferOwnership');
  },
  listInvitations: async (workspaceId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.get<WorkspaceInvitation[]>(
      `/workspaces/${workspaceId}/invitations`,
      { ...options, workspaceId },
    );
    return strictValidate(invitationListSchema, res, 'workspaces.listInvitations');
  },
  inviteMember: async (
    workspaceId: string,
    input: { email: string; role: AssignableWorkspaceRole },
    options?: ApiRequestOptions,
  ) => {
    const res = await apiClient.post<WorkspaceInvitationIssued>(
      `/workspaces/${workspaceId}/invitations`,
      input,
      { ...options, workspaceId },
    );
    return strictValidate(workspaceInvitationIssuedSchema, res, 'workspaces.inviteMember');
  },
  resendInvitation: async (
    workspaceId: string,
    invitationId: string,
    options?: ApiRequestOptions,
  ) => {
    const res = await apiClient.post<WorkspaceInvitationIssued>(
      `/workspaces/${workspaceId}/invitations/${invitationId}/resend`,
      {},
      { ...options, workspaceId },
    );
    return strictValidate(workspaceInvitationIssuedSchema, res, 'workspaces.resendInvitation');
  },
  revokeInvitation: (workspaceId: string, invitationId: string, options?: ApiRequestOptions) =>
    apiClient.delete<void>(`/workspaces/${workspaceId}/invitations/${invitationId}`, {
      ...options,
      workspaceId,
    }),
  /**
   * Join an invited workspace. Deliberately not workspace-scoped: the token
   * names the workspace, because the acceptor is not a member yet.
   */
  acceptInvitation: async (token: string, options?: ApiRequestOptions) => {
    const res = await apiClient.post<Workspace>(
      '/workspaces/invitations/accept',
      { token },
      options,
    );
    return strictValidate(workspaceSchema, res, 'workspaces.acceptInvitation');
  },
};
