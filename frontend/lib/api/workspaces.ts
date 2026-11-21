import { mutationOptions, queryOptions, type Query, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { getBootstrapReadTimeoutMs } from '@/lib/config/operational';
import { apiClient, type ApiRequestOptions } from './client';
import { queryKeys } from './query-keys';
import { isAccessRecoveryKey } from './query-keys/core';
import {
  workspaceInvitationIssuedSchema,
  workspaceInvitationSchema,
  workspaceMemberSchema,
  workspaceSchema,
  workspaceAccessSchema,
} from '@citeladder/contracts/auth';
import type {
  InvitationAcceptRequest,
  InvitationCreateRequest,
  MemberRoleUpdateRequest,
  OwnershipTransferRequest,
  WorkspaceCreateRequest,
} from '@citeladder/contracts/auth-requests';
import { strictValidate } from '@citeladder/contracts/validation';
import type { Workspace } from '@citeladder/contracts';

export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;
export type WorkspaceInvitation = z.infer<typeof workspaceInvitationSchema>;
export type WorkspaceInvitationIssued = z.infer<typeof workspaceInvitationIssuedSchema>;

export const ASSIGNABLE_WORKSPACE_ROLES = ['admin', 'member', 'viewer'] as const;
export type AssignableWorkspaceRole = (typeof ASSIGNABLE_WORKSPACE_ROLES)[number];

const workspaceListSchema = z.array(workspaceSchema);
const memberListSchema = z.array(workspaceMemberSchema);
const invitationListSchema = z.array(workspaceInvitationSchema);

export const workspacesApi = {
  list: async (options?: ApiRequestOptions) => {
    const res = await apiClient.get<Workspace[]>('/workspaces', { ...options, workspaceId: null });
    return strictValidate(workspaceListSchema, res, 'workspaces.list');
  },
  create: async (input: { name: string; termsRevision: string }) =>
    strictValidate(
      workspaceSchema,
      await apiClient.post<Workspace>(
        '/workspaces',
        {
          name: input.name,
          terms_revision: input.termsRevision,
          accept_terms: true,
        } satisfies WorkspaceCreateRequest,
        { workspaceId: null },
      ),
      'workspaces.create',
    ),
  leave: (workspaceId: string, options?: ApiRequestOptions) =>
    apiClient.post<void>(
      `/workspaces/${workspaceId}/members/leave`,
      {},
      {
        ...options,
        workspaceId,
      },
    ),
  access: async (workspaceId: string, options?: ApiRequestOptions) =>
    strictValidate(
      workspaceAccessSchema,
      await apiClient.get(`/workspaces/${workspaceId}/access`, { ...options, workspaceId }),
      'workspaces.access',
    ),
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
      { role } satisfies MemberRoleUpdateRequest,
      { ...options, workspaceId },
    );
    return strictValidate(workspaceMemberSchema, res, 'workspaces.updateMemberRole');
  },
  removeMember: (workspaceId: string, memberId: string, options?: ApiRequestOptions) =>
    apiClient.delete<void>(`/workspaces/${workspaceId}/members/${memberId}`, {
      ...options,
      workspaceId,
    }),
  transferOwnership: async (workspaceId: string, memberId: string, options?: ApiRequestOptions) => {
    const res = await apiClient.post<WorkspaceMember[]>(
      `/workspaces/${workspaceId}/ownership`,
      { member_id: memberId } satisfies OwnershipTransferRequest,
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
    input: InvitationCreateRequest,
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
  acceptInvitation: async (token: string, options?: ApiRequestOptions) => {
    const res = await apiClient.post<Workspace>(
      '/workspaces/invitations/accept',
      { token } satisfies InvitationAcceptRequest,
      options,
    );
    return strictValidate(workspaceSchema, res, 'workspaces.acceptInvitation');
  },
};

export const workspaceQueries = {
  list: () =>
    queryOptions({
      queryKey: queryKeys.workspaces.list(),
      queryFn: ({ signal }) =>
        workspacesApi.list({ signal, timeoutMs: getBootstrapReadTimeoutMs() }),
    }),
  access: (workspaceId: string) =>
    queryOptions({
      queryKey: queryKeys.workspaces.access(workspaceId),
      queryFn: ({ signal }) =>
        workspacesApi.access(workspaceId, { signal, timeoutMs: getBootstrapReadTimeoutMs() }),
    }),
  members: (workspaceId: string) =>
    queryOptions({
      queryKey: queryKeys.workspaces.members(workspaceId),
      queryFn: ({ signal }) => workspacesApi.listMembers(workspaceId, { signal, workspaceId }),
    }),
  invitations: (workspaceId: string) =>
    queryOptions({
      queryKey: queryKeys.workspaces.invitations(workspaceId),
      queryFn: ({ signal }) => workspacesApi.listInvitations(workspaceId, { signal, workspaceId }),
    }),
};

export const refreshWorkspaces = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: queryKeys.workspaces.all });

export const resetWorkspaceAccess = (client: QueryClient, workspaceId: string) =>
  client.resetQueries({ queryKey: queryKeys.workspaces.access(workspaceId), exact: true });

export function isAccessRecoveryQuery(query: {
  queryKey: readonly unknown[];
  meta?: Record<string, unknown>;
}) {
  return isAccessRecoveryKey(query.queryKey) || query.meta?.accessRecovery === true;
}

export function dropProductReads(client: QueryClient) {
  const predicate = (query: Query) => !isAccessRecoveryQuery(query);
  void client.cancelQueries({ predicate });
  client.removeQueries({ predicate });
}

const rosterRefreshed = {
  onSuccess: (
    _data: unknown,
    _vars: unknown,
    _result: unknown,
    { client }: { client: QueryClient },
  ) => {
    void refreshWorkspaces(client);
  },
};

export const workspaceMutations = {
  create: () =>
    mutationOptions({
      mutationFn: (input: { name: string; termsRevision: string }) => workspacesApi.create(input),
      onSuccess: (workspace, _input, _result, { client }) =>
        client.setQueryData<Workspace[]>(queryKeys.workspaces.list(), (current) => [
          ...(current ?? []),
          workspace,
        ]),
      onError: (_error, _input, _result, { client }) =>
        client.invalidateQueries({ queryKey: queryKeys.auth.terms() }),
    }),
  acceptInvitation: () =>
    mutationOptions({
      mutationFn: (token: string) => workspacesApi.acceptInvitation(token),
      onSuccess: (_workspace, _token, _result, { client }) => refreshWorkspaces(client),
    }),
  invite: (workspaceId: string) =>
    mutationOptions({
      mutationFn: (input: InvitationCreateRequest) =>
        workspacesApi.inviteMember(workspaceId, input, { workspaceId }),
      ...rosterRefreshed,
    }),
  resendInvitation: (workspaceId: string) =>
    mutationOptions({
      mutationFn: (invitationId: string) =>
        workspacesApi.resendInvitation(workspaceId, invitationId, { workspaceId }),
      ...rosterRefreshed,
    }),
  revokeInvitation: (workspaceId: string) =>
    mutationOptions({
      mutationFn: (invitationId: string) =>
        workspacesApi.revokeInvitation(workspaceId, invitationId, { workspaceId }),
      ...rosterRefreshed,
    }),
  changeRole: (workspaceId: string) =>
    mutationOptions({
      mutationFn: ({ memberId, role }: { memberId: string; role: AssignableWorkspaceRole }) =>
        workspacesApi.updateMemberRole(workspaceId, memberId, role, { workspaceId }),
      ...rosterRefreshed,
    }),
  removeMember: (workspaceId: string) =>
    mutationOptions({
      mutationFn: (memberId: string) =>
        workspacesApi.removeMember(workspaceId, memberId, { workspaceId }),
      ...rosterRefreshed,
    }),
  transferOwnership: (workspaceId: string) =>
    mutationOptions({
      mutationFn: (memberId: string) =>
        workspacesApi.transferOwnership(workspaceId, memberId, { workspaceId }),
      ...rosterRefreshed,
    }),
};
