import { afterAll, beforeAll, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password.ts';
import {
  authenticateOperator,
  manageAccount,
  type OperatorSession,
} from '../src/workspaces/account-manager.ts';
import { hashInvitationToken, acceptInvitation } from '../src/workspaces/invitations.ts';
import { Fixtures, testDatabase } from './support.ts';

const db = testDatabase(),
  fixtures = new Fixtures(db);
let owner: string,
  admin: string,
  target: string,
  workspace: string,
  foreign: string,
  session: OperatorSession;
let createdId: string | undefined;
let createdWorkspace: string | undefined;
const email = (id: string) => `${id}@example.test`;
beforeAll(async () => {
  owner = await fixtures.user();
  admin = await fixtures.user();
  target = await fixtures.user();
  workspace = await fixtures.ownedWorkspace(owner, { access: false });
  await fixtures.member(workspace, admin, 'admin');
  await fixtures.member(workspace, target, 'member');
  foreign = await fixtures.ownedWorkspace(await fixtures.user());
  await db
    .updateTable('users')
    .set({ hashed_password: await hashPassword('password123') })
    .where('id', 'in', [owner, admin, target])
    .execute();
  session = await authenticateOperator(db, email(admin), workspace, 'password123');
});
afterAll(async () => {
  await db.deleteFrom('security_events').where('workspace_id', '=', workspace).execute();
  if (createdWorkspace)
    await db.deleteFrom('workspaces').where('id', '=', createdWorkspace).execute();
  await fixtures.cleanup();
  if (createdId) await db.deleteFrom('users').where('id', '=', createdId).execute();
  await db.destroy();
});

it('authenticates against an explicit workspace without provisioning access', async () => {
  await expect(authenticateOperator(db, email(admin), workspace, 'wrong')).rejects.toThrow(
    'authentication_failed',
  );
  await expect(authenticateOperator(db, email(target), workspace, 'password123')).rejects.toThrow(
    'workspace_admin_required',
  );
  await expect(authenticateOperator(db, email(admin), foreign, 'password123')).rejects.toThrow(
    'workspace_admin_required',
  );
  expect(
    await db
      .selectFrom('billing_accounts')
      .select('id')
      .where('workspace_id', '=', workspace)
      .execute(),
  ).toEqual([]);
});

it('creates an invited identity without signup grants, stores a hashed token and joins through the native invitation owner', async () => {
  const invitedEmail = `invited-${admin}@example.test`;
  const result = await manageAccount(db, session, {
    kind: 'invite',
    email: invitedEmail,
    role: 'viewer',
    password: 'password123',
  });
  if (!result || !('token' in result)) throw new Error('Expected invitation');
  const created = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', invitedEmail)
    .executeTakeFirstOrThrow();
  createdId = created.id;
  expect(await verifyPassword('password123', created.hashed_password)).toBe(true);
  const personal = await db
    .selectFrom('workspace_members')
    .select(['workspace_id', 'role'])
    .where('user_id', '=', created.id)
    .executeTakeFirstOrThrow();
  createdWorkspace = personal.workspace_id;
  expect(personal.role).toBe('owner');
  expect(personal.workspace_id).not.toBe(workspace);
  const account = await db
    .selectFrom('billing_accounts')
    .selectAll()
    .where('workspace_id', '=', personal.workspace_id)
    .executeTakeFirstOrThrow();
  expect(
    await db
      .selectFrom('account_grants')
      .select('id')
      .where('billing_account_id', '=', account.id)
      .execute(),
  ).toEqual([]);
  expect(account.registration_cohort_at).toEqual(created.created_at);
  const persisted = await db
    .selectFrom('workspace_invitations')
    .selectAll()
    .where('id', '=', result.invitation.id)
    .executeTakeFirstOrThrow();
  expect(persisted.token_sha256).toBe(hashInvitationToken(result.token));
  expect(persisted.token_sha256).not.toBe(result.token);
  await acceptInvitation(db, created.id, result.token);
  expect(
    await db
      .selectFrom('workspace_members')
      .select(['workspace_id', 'role'])
      .where('user_id', '=', created.id)
      .where('workspace_id', '=', workspace)
      .execute(),
  ).toEqual([{ workspace_id: workspace, role: 'viewer' }]);
  expect(
    await db
      .selectFrom('billing_accounts')
      .select('id')
      .where('workspace_id', '=', workspace)
      .execute(),
  ).toEqual([]);
});

it.each(['deactivate', 'demote', 'remove', 'password', 'sessions'])(
  'rechecks %s revocation after operator confirmation and before each choice',
  async (revocation) => {
    await manageAccount(db, session, { kind: 'list' });
    // A separate connection commits the revocation while the terminal collects confirmation.
    const original = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', admin)
      .executeTakeFirstOrThrow();
    if (revocation === 'deactivate')
      await db.updateTable('users').set({ is_active: false }).where('id', '=', admin).execute();
    if (revocation === 'demote')
      await db
        .updateTable('workspace_members')
        .set({ role: 'viewer' })
        .where('workspace_id', '=', workspace)
        .where('user_id', '=', admin)
        .execute();
    if (revocation === 'remove')
      await db
        .deleteFrom('workspace_members')
        .where('workspace_id', '=', workspace)
        .where('user_id', '=', admin)
        .execute();
    if (revocation === 'password')
      await db
        .updateTable('users')
        .set({ hashed_password: await hashPassword('changed123') })
        .where('id', '=', admin)
        .execute();
    if (revocation === 'sessions')
      await db.updateTable('users').set({ session_version: 1 }).where('id', '=', admin).execute();
    try {
      await expect(manageAccount(db, session, { kind: 'list' })).rejects.toThrow(
        'workspace_admin_required',
      );
      await expect(
        manageAccount(db, session, {
          kind: 'invite',
          email: `denied-${admin}@example.test`,
          role: 'member',
          password: 'password123',
        }),
      ).rejects.toThrow('workspace_admin_required');
      await expect(
        manageAccount(db, session, { kind: 'role', email: email(target), role: 'admin' }),
      ).rejects.toThrow('workspace_admin_required');
      await expect(
        manageAccount(db, session, {
          kind: 'password',
          email: email(target),
          password: 'newpass123',
        }),
      ).rejects.toThrow('workspace_admin_required');
      expect(
        await db
          .selectFrom('users')
          .select('id')
          .where('email', '=', `denied-${admin}@example.test`)
          .execute(),
      ).toEqual([]);
    } finally {
      await db
        .updateTable('users')
        .set({
          is_active: true,
          hashed_password: original.hashed_password,
          session_version: original.session_version,
        })
        .where('id', '=', admin)
        .execute();
      if (revocation === 'remove') await fixtures.member(workspace, admin, 'admin');
      else
        await db
          .updateTable('workspace_members')
          .set({ role: 'admin' })
          .where('workspace_id', '=', workspace)
          .where('user_id', '=', admin)
          .execute();
    }
  },
);

it('bounds roles, targets members only and invalidates sessions when resetting a password', async () => {
  await expect(
    manageAccount(db, session, { kind: 'invite', email: 'bad@example.test', role: 'owner' }),
  ).rejects.toThrow();
  await expect(
    manageAccount(db, session, { kind: 'role', email: email(owner), role: 'member' }),
  ).rejects.toThrow('Transfer ownership');
  const foreignUser = await fixtures.user();
  await fixtures.member(foreign, foreignUser, 'member');
  await expect(
    manageAccount(db, session, {
      kind: 'password',
      email: email(foreignUser),
      password: 'newpass123',
    }),
  ).rejects.toThrow('user_not_in_workspace');
  await expect(
    manageAccount(db, session, { kind: 'role', email: email(foreignUser), role: 'admin' }),
  ).rejects.toThrow('user_not_in_workspace');
  await manageAccount(db, session, { kind: 'role', email: email(target), role: 'viewer' });
  await manageAccount(db, session, {
    kind: 'password',
    email: email(target),
    password: 'newpass123',
  });
  const reset = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', target)
    .executeTakeFirstOrThrow();
  expect(reset.session_version).toBe(1);
  expect(await verifyPassword('newpass123', reset.hashed_password)).toBe(true);
  expect(
    (
      await db
        .selectFrom('workspace_members')
        .select('role')
        .where('workspace_id', '=', workspace)
        .where('user_id', '=', target)
        .executeTakeFirstOrThrow()
    ).role,
  ).toBe('viewer');
  await db
    .deleteFrom('workspace_members')
    .where('workspace_id', '=', workspace)
    .where('user_id', '=', target)
    .execute();
  await expect(
    manageAccount(db, session, {
      kind: 'password',
      email: email(target),
      password: 'thirdpass123',
    }),
  ).rejects.toThrow('user_not_in_workspace');
});
