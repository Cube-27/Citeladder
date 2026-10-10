import {
  workspaceSchema,
  workspaceAccessSchema,
  workspaceMemberSchema,
  workspaceInvitationSchema,
  workspaceInvitationIssuedSchema,
  policyStatusSchema,
} from '@citeladder/contracts/auth';
import { z } from 'zod';
import { workspaceAccess } from '../entitlements/access.ts';
import { deliverInvitation } from '../workspaces/invitation-mail.ts';
import { defineGetRoute, definePostRoute, definePatchRoute, defineDeleteRoute } from './define.ts';
import { readBody } from '../http/body.ts';
import { acceptPolicy, policyStatus } from '../workspaces/policies.ts';
import {
  createWorkspace,
  listMembers,
  mutateMember,
  transferOwnership,
  workspaceView,
  assignableRoleSchema,
} from '../workspaces/service.ts';
import {
  acceptInvitation,
  listInvitations,
  issueInvitation,
  updateInvitation,
} from '../workspaces/invitations.ts';

const root = '/api/v1/workspaces';
const pathRoot = `${root}/{workspace_id}`;
const uuid = { scalar: { kind: 'uuid' }, required: true } as const;
const workspacePath = { workspace_id: uuid };
const base = {
  family: 'workspaces',
  authorize: 'workspace-path',
  capability: 'read',
  params: { path: workspacePath, query: {} },
} as const;
const admin = { ...base, capability: 'manage_members' } as const;
const memberPath = { workspace_id: uuid, member_id: uuid };
const invitationPath = { workspace_id: uuid, invitation_id: uuid };
const workspaceCreate = z.object({ name: z.string().trim().min(1).max(255) });
const accept = z.object({ token: z.string().min(16).max(256) });
const roleUpdate = z.object({ role: assignableRoleSchema });
const transfer = z.object({ member_id: z.uuid() });
const invite = z.object({ email: z.email().trim().max(255), role: assignableRoleSchema });
const policyDecision = z.object({
  terms_revision: z.string().min(1).max(64),
  accept_terms: z.literal(true),
});

export const workspaceRoutes = [
  defineGetRoute({
    ...base,
    recovery: true,
    path: `${pathRoot}/access`,
    response: workspaceAccessSchema,
    handle: ({ db }, { path }) => workspaceAccess(db, path.workspace_id),
  }),
  defineGetRoute({
    family: 'workspaces',
    authorize: 'session',
    path: root,
    params: { path: {}, query: {} },
    response: z.array(workspaceSchema),
    async handle({ c, db }) {
      const rows = await db
        .selectFrom('workspaces')
        .innerJoin('workspace_members', 'workspace_members.workspace_id', 'workspaces.id')
        .selectAll('workspaces')
        .select('workspace_members.role')
        .where('workspace_members.user_id', '=', c.get('user').id)
        .where('workspaces.is_system', '=', false)
        .orderBy('workspaces.created_at')
        .orderBy('workspaces.id')
        .execute();
      return rows.map((row) => workspaceView(row, row.role));
    },
  }),
  definePostRoute({
    family: 'workspaces',
    authorize: 'session',
    path: root,
    params: { path: {}, query: {} },
    response: workspaceSchema,
    status: 201,
    body: workspaceCreate,
    async handle({ c, db }) {
      return createWorkspace(db, c.get('user').id, (await readBody(c, workspaceCreate)).name);
    },
  }),
  definePostRoute({
    family: 'workspaces',
    authorize: 'session',
    path: `${root}/invitations/accept`,
    params: { path: {}, query: {} },
    response: workspaceSchema,
    body: accept,
    async handle({ c, db }) {
      return acceptInvitation(db, c.get('user').id, (await readBody(c, accept)).token);
    },
  }),
  defineGetRoute({
    ...admin,
    path: `${pathRoot}/members`,
    response: z.array(workspaceMemberSchema),
    handle: ({ c, db }, { path }) => listMembers(db, path.workspace_id, c.get('user').id),
  }),
  definePatchRoute({
    ...admin,
    path: `${pathRoot}/members/{member_id}`,
    params: { path: memberPath, query: {} },
    response: workspaceMemberSchema,
    body: roleUpdate,
    async handle({ c, db }, { path }) {
      const role = (await readBody(c, roleUpdate)).role;
      return (await mutateMember(db, path.workspace_id, c.get('user').id, {
        memberId: path.member_id,
        role,
      }))!;
    },
  }),
  defineDeleteRoute({
    ...admin,
    path: `${pathRoot}/members/{member_id}`,
    params: { path: memberPath, query: {} },
    async handle({ c, db }, { path }) {
      await mutateMember(db, path.workspace_id, c.get('user').id, {
        memberId: path.member_id,
        remove: true,
      });
    },
  }),
  definePostRoute({
    ...base,
    path: `${pathRoot}/members/leave`,
    response: z.null(),
    raw: true,
    status: 204,
    async handle({ c, db }, { path }) {
      await mutateMember(db, path.workspace_id, c.get('user').id, { leave: true });
      return c.body(null, 204);
    },
  }),
  definePostRoute({
    ...admin,
    path: `${pathRoot}/ownership`,
    response: z.array(workspaceMemberSchema),
    body: transfer,
    async handle({ c, db }, { path }) {
      return transferOwnership(
        db,
        path.workspace_id,
        c.get('user').id,
        (await readBody(c, transfer)).member_id,
      );
    },
  }),
  defineGetRoute({
    ...admin,
    path: `${pathRoot}/invitations`,
    response: z.array(workspaceInvitationSchema),
    handle: ({ db }, { path }) => listInvitations(db, path.workspace_id),
  }),
  definePostRoute({
    ...admin,
    path: `${pathRoot}/invitations`,
    response: workspaceInvitationIssuedSchema,
    status: 201,
    body: invite,
    async handle({ c, db, config }, { path }) {
      const body = await readBody(c, invite);
      return deliverInvitation(
        db,
        config,
        await issueInvitation(db, path.workspace_id, c.get('user').id, body.email, body.role),
      );
    },
  }),
  definePostRoute({
    ...admin,
    path: `${pathRoot}/invitations/{invitation_id}/resend`,
    params: { path: invitationPath, query: {} },
    response: workspaceInvitationIssuedSchema,
    handle: async ({ c, db, config }, { path }) =>
      deliverInvitation(
        db,
        config,
        await updateInvitation(db, path.workspace_id, c.get('user').id, path.invitation_id, false),
      ),
  }),
  defineDeleteRoute({
    ...admin,
    path: `${pathRoot}/invitations/{invitation_id}`,
    params: { path: invitationPath, query: {} },
    async handle({ c, db }, { path }) {
      await updateInvitation(db, path.workspace_id, c.get('user').id, path.invitation_id, true);
    },
  }),
  defineGetRoute({
    ...base,
    path: `${pathRoot}/policies`,
    recovery: true,
    response: policyStatusSchema,
    handle: ({ c, db }, { path }) => policyStatus(db, path.workspace_id, c.get('user').id),
  }),
  definePostRoute({
    ...base,
    path: `${pathRoot}/policies`,
    response: policyStatusSchema,
    body: policyDecision,
    recovery: true,
    async handle({ c, db }, { path }) {
      return acceptPolicy(
        db,
        path.workspace_id,
        c.get('user').id,
        (await readBody(c, policyDecision)).terms_revision,
      );
    },
  }),
];
