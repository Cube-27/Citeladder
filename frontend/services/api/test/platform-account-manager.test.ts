import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/auth/password.ts';
import { authenticateUser } from '../src/auth/service.ts';
import {
  managePlatformAccounts,
  authenticatePlatformOperator,
  platformAccountInventory,
  platformAccountGrants,
  type AccountRequest,
  type PlatformAction,
  type PlatformSession,
} from '../src/workspaces/account-manager.ts';
import { resolveAccountEntitlement } from '../src/entitlements/resolve.ts';
import { billingAccount } from './prompt-fixtures.ts';
import { Fixtures, testDatabase } from './support.ts';

const db = testDatabase(),
  fixtures = new Fixtures(db);
const password = 'fixture-account-password';
let actor: string, workspace: string, accountId: string, session: PlatformSession;
const createdUsers: string[] = [],
  createdWorkspaces: string[] = [];
const email = () => `${randomUUID()}@example.test`;
const request = (apply = true): AccountRequest => ({
  reason: 'account lifecycle fixture',
  key: `fixture:${randomUUID()}`,
  at: new Date(),
  apply,
});
beforeAll(async () => {
  actor = await fixtures.user();
  await db
    .updateTable('users')
    .set({ role: 'admin', hashed_password: await hashPassword(password) })
    .where('id', '=', actor)
    .execute();
  workspace = await fixtures.ownedWorkspace(await fixtures.user());
  accountId = await billingAccount(db, workspace);
  session = await authenticatePlatformOperator(db, `${actor}@example.test`, password);
});
afterAll(async () => {
  await db.deleteFrom('security_events').where('actor_id', '=', actor).execute();
  if (createdWorkspaces.length)
    await db.deleteFrom('workspaces').where('id', 'in', createdWorkspaces).execute();
  if (createdUsers.length) await db.deleteFrom('users').where('id', 'in', createdUsers).execute();
  await fixtures.cleanup();
  await db.destroy();
});

async function create(action: Extract<PlatformAction, { kind: 'create' }>, input = request()) {
  const result = await managePlatformAccounts(db, session, action, input);
  if (!result || !('created' in result)) throw new Error('Expected created accounts');
  if (input.apply)
    for (const user of result.created) {
      createdUsers.push(user.user_id);
      createdWorkspaces.push(user.personal_workspace_id);
    }
  return result;
}

it('previews a complete account without persisting it, then provisions finite full access and a customer Owner identity', async () => {
  const address = email(),
    until = new Date(Date.now() + 86400000);
  const action = {
    kind: 'create' as const,
    emails: [address],
    password,
    role: 'owner',
    access: { allowance: 25, until },
  };
  const input = request(false);
  await create(action, input);
  expect(await db.selectFrom('users').select('id').where('email', '=', address).execute()).toEqual(
    [],
  );
  const result = await create(action, { ...input, apply: true });
  const user = result.created[0]!;
  const identity = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', user.user_id)
    .executeTakeFirstOrThrow();
  expect(identity.role).toBe('user');
  expect(await verifyPassword(password, identity.hashed_password)).toBe(true);
  const account = await db
    .selectFrom('billing_accounts')
    .select('id')
    .where('workspace_id', '=', user.workspace_id)
    .executeTakeFirstOrThrow();
  const scope = { workspaceId: user.workspace_id, accountId: account.id };
  const resolved = await resolveAccountEntitlement(db, scope, new Date());
  expect(resolved.status).toBe('resolved');
  if (resolved.status !== 'resolved') throw new Error('Expected resolved grants');
  expect(resolved.values.get('project_slots')).toBe(26);
  expect(resolved.values.get('agent')).toBe(1);
  expect(resolved.validUntil).toEqual(until);
  await expect(authenticatePlatformOperator(db, address, password)).rejects.toThrow(
    'active platform administrator',
  );
});

it('joins a batch as workspace Admins atomically and grants the shared account only once', async () => {
  const addresses = [email(), email()];
  const result = await create({
    kind: 'create',
    emails: addresses,
    password,
    workspaceId: workspace,
    role: 'admin',
    access: { allowance: 40, until: null },
  });
  const resolved = await resolveAccountEntitlement(
    db,
    { workspaceId: workspace, accountId },
    new Date(),
  );
  if (resolved.status !== 'resolved') throw new Error('Expected resolved grants');
  expect(resolved.values.get('prompt_slots')).toBe(40);
  for (const user of result.created) {
    const member = await db
      .selectFrom('workspace_members')
      .select('role')
      .where('workspace_id', '=', workspace)
      .where('user_id', '=', user.user_id)
      .executeTakeFirstOrThrow();
    expect(member.role).toBe('admin');
  }
  const fresh = email();
  await expect(
    create({
      kind: 'create',
      emails: [fresh, addresses[0]!],
      password,
      workspaceId: workspace,
      role: 'admin',
    }),
  ).rejects.toThrow('user_already_exists');
  expect(await db.selectFrom('users').select('id').where('email', '=', fresh).execute()).toEqual(
    [],
  );
  const target = result.created[0]!;
  await managePlatformAccounts(
    db,
    session,
    { kind: 'role', workspaceId: workspace, email: target.email, role: 'viewer' },
    request(),
  );
  await managePlatformAccounts(
    db,
    session,
    {
      kind: 'password',
      workspaceId: workspace,
      email: target.email,
      password: 'fixture-reset-password',
    },
    request(),
  );
  const reset = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', target.user_id)
    .executeTakeFirstOrThrow();
  expect(reset.session_version).toBe(1);
  expect(await verifyPassword('fixture-reset-password', reset.hashed_password)).toBe(true);
  await expect(
    managePlatformAccounts(
      db,
      session,
      {
        kind: 'password',
        workspaceId: result.created[1]!.personal_workspace_id,
        email: target.email,
        password,
      },
      request(),
    ),
  ).rejects.toThrow();
});

it('gives a new owner the baseline and still deletes the unused account while retaining the receipt', async () => {
  const result = await create({ kind: 'create', emails: [email()], password, role: 'owner' });
  const target = result.created[0]!;
  const account = await db
    .selectFrom('billing_accounts')
    .select('id')
    .where('workspace_id', '=', target.workspace_id)
    .executeTakeFirstOrThrow();
  const baseline = await resolveAccountEntitlement(
    db,
    { workspaceId: target.workspace_id, accountId: account.id },
    new Date(),
  );
  expect(baseline.status).toBe('resolved');
  const action = { kind: 'delete' as const, email: target.email };
  await managePlatformAccounts(db, session, action, request(false));
  expect(
    await db.selectFrom('users').select('id').where('id', '=', target.user_id).execute(),
  ).toHaveLength(1);
  await managePlatformAccounts(db, session, action, request());
  expect(
    await db.selectFrom('users').select('id').where('id', '=', target.user_id).execute(),
  ).toEqual([]);
  expect(
    await db.selectFrom('workspaces').select('id').where('id', '=', target.workspace_id).execute(),
  ).toEqual([]);
  expect(
    await db
      .selectFrom('security_events')
      .select('event')
      .where('target_id', '=', target.user_id)
      .where('event', '=', 'account.delete')
      .execute(),
  ).toHaveLength(1);
});

it('retains grant history when deletion is refused, and disables/reenables login with session revocation instead', async () => {
  const result = await create({
    kind: 'create',
    emails: [email()],
    password,
    role: 'owner',
    access: { allowance: 10, until: null },
  });
  const target = result.created[0]!;
  await expect(
    managePlatformAccounts(db, session, { kind: 'delete', email: target.email }, request()),
  ).rejects.toThrow('account_has_retained_activity');
  await managePlatformAccounts(
    db,
    session,
    { kind: 'state', email: target.email, active: false },
    request(),
  );
  expect(await authenticateUser(db, target.email, password)).toBeNull();
  await managePlatformAccounts(
    db,
    session,
    { kind: 'state', email: target.email, active: true },
    request(),
  );
  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', target.user_id)
    .executeTakeFirstOrThrow();
  expect(user.is_active).toBe(true);
  expect(user.session_version).toBe(2);
  // Password resets are refused for platform administrators, like disable/delete.
  await db.updateTable('users').set({ role: 'admin' }).where('id', '=', target.user_id).execute();
  await expect(
    managePlatformAccounts(
      db,
      session,
      { kind: 'password', workspaceId: target.workspace_id, email: target.email, password },
      request(),
    ),
  ).rejects.toThrow('account_password_forbidden');
});

it('serializes competing account creation and rechecks operator revocation before a confirmed mutation', async () => {
  const action = { kind: 'create' as const, emails: [email()], password, role: 'owner' };
  const results = await Promise.allSettled([create(action), create(action)]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  await db.updateTable('users').set({ session_version: 1 }).where('id', '=', actor).execute();
  try {
    await expect(platformAccountInventory(db, session)).rejects.toThrow('operator_session_revoked');
    await expect(
      managePlatformAccounts(
        db,
        session,
        { kind: 'create', emails: [email()], password, role: 'owner' },
        request(),
      ),
    ).rejects.toThrow('operator_session_revoked');
  } finally {
    await db.updateTable('users').set({ session_version: 0 }).where('id', '=', actor).execute();
  }
});

it('replays an access grant without increasing allowances and revokes exact grant IDs without deleting history', async () => {
  const result = await create({ kind: 'create', emails: [email()], password, role: 'owner' });
  const target = result.created[0]!;
  const account = await db
    .selectFrom('billing_accounts')
    .select('id')
    .where('workspace_id', '=', target.workspace_id)
    .executeTakeFirstOrThrow();
  const action = {
    kind: 'access' as const,
    workspaceId: target.workspace_id,
    accountId: account.id,
    access: { allowance: 12, until: null },
  };
  const before = await resolveAccountEntitlement(db, action, new Date());
  if (before.status !== 'resolved') throw new Error('Expected the baseline');
  const input = request();
  const first = await managePlatformAccounts(db, session, action, input);
  const grantInventory = await platformAccountGrants(db, session, action);
  expect(grantInventory.map((grant) => grant.value)).toContain(12);
  await expect(
    platformAccountGrants(db, session, { workspaceId: workspace, accountId: account.id }),
  ).rejects.toThrow();
  const replay = await managePlatformAccounts(db, session, action, input);
  if (!first || !('grant_ids' in first) || !replay || !('grant_ids' in replay))
    throw new Error('Expected grant IDs');
  expect({ ...replay, grant_ids: new Set(replay.grant_ids) }).toEqual({
    ...first,
    grant_ids: new Set(first.grant_ids),
  });
  await managePlatformAccounts(
    db,
    session,
    {
      kind: 'revoke',
      workspaceId: target.workspace_id,
      accountId: account.id,
      grantIds: first.grant_ids,
    },
    request(),
  );
  const resolved = await resolveAccountEntitlement(db, action, new Date());
  if (resolved.status !== 'resolved') throw new Error('Expected resolved grants');
  // Revocation returns the account to its baseline.
  expect(resolved.values.get('prompt_slots')).toBe(before.values.get('prompt_slots'));
  // Revoked grants stay as history.
  const retained = await db
    .selectFrom('account_grants')
    .select('id')
    .where('billing_account_id', '=', account.id)
    .execute();
  expect(retained.map((grant) => grant.id)).toEqual(expect.arrayContaining(first.grant_ids));
});
