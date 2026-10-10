import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createApp } from '../src/app.ts';
import { policy } from '../src/config.ts';
import { hashInvitationToken } from '../src/workspaces/invitations.ts';
import { sql } from 'kysely';
import { billingAccount, grant } from './prompt-fixtures.ts';
import { Fixtures, sessionToken, testConfig, testDatabase } from './support.ts';

const config = testConfig();
const db = testDatabase(config);
const fixtures = new Fixtures(db);
const app = createApp(config, db);
const actors: string[] = [];
let owner: string;
let workspace: string;
let ownerCookie: string;
let viewerCookie: string;
let invitee: string;
let inviteeCookie: string;

async function userCookie(id: string) {
  return `${config.session.cookieName}=${await sessionToken({ sub: id, ver: 0 })}`;
}
async function request(path: string, method = 'GET', body?: object, cookie = ownerCookie) {
  return app.request(`/api/v1/workspaces${path}`, {
    method,
    headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function memberId(userId: string, space = workspace) {
  return (
    await db
      .selectFrom('workspace_members')
      .select('id')
      .where('workspace_id', '=', space)
      .where('user_id', '=', userId)
      .executeTakeFirstOrThrow()
  ).id;
}

beforeAll(async () => {
  owner = await fixtures.user();
  actors.push(owner);
  workspace = await fixtures.ownedWorkspace(owner);
  ownerCookie = await userCookie(owner);
  const viewer = await fixtures.user();
  actors.push(viewer);
  await fixtures.member(workspace, viewer, 'viewer');
  viewerCookie = await userCookie(viewer);
  invitee = await fixtures.user();
  actors.push(invitee);
  inviteeCookie = await userCookie(invitee);
});

afterAll(async () => {
  await db.deleteFrom('security_events').where('workspace_id', '=', workspace).execute();
  await db.deleteFrom('security_events').where('actor_id', 'in', actors).execute();
  await fixtures.cleanup();
  await db.destroy();
});

describe('workspace authorization and root allocation', () => {
  it('lists tenant memberships without requiring a selected workspace and refuses foreign management', async () => {
    const listing = await request('');
    expect(listing.status).toBe(200);
    expect(((await listing.json()) as { id: string }[]).some((row) => row.id === workspace)).toBe(
      true,
    );
    expect((await request(`/${workspace}/members`, 'GET', undefined, viewerCookie)).status).toBe(
      403,
    );
    const foreign = await fixtures.ownedWorkspace(await fixtures.user());
    const found = await request(`/${foreign}/members`);
    const missing = await request(`/${randomUUID()}/members`);
    expect(found.status).toBe(404);
    expect(await found.json()).toMatchObject({
      detail: ((await missing.json()) as { detail: string }).detail,
    });
    expect((await request(`/${workspace}/members`, 'GET', undefined, '')).status).toBe(401);
  });

  it('serializes concurrent workspace creation, counts owned roots and provisions billing in the same commit', async () => {
    const user = await fixtures.user();
    actors.push(user);
    const cookie = await userCookie(user);
    const terms = { terms_revision: policy.auth.terms_revision, accept_terms: true };
    const results = await Promise.all([
      request('', 'POST', { name: 'First', ...terms }, cookie),
      request('', 'POST', { name: 'Second', ...terms }, cookie),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([201, 403]);
    const space = (
      await db
        .selectFrom('workspace_members')
        .select('workspace_id')
        .where('user_id', '=', user)
        .executeTakeFirstOrThrow()
    ).workspace_id;
    try {
      expect(
        await db
          .selectFrom('billing_accounts')
          .select('id')
          .where('workspace_id', '=', space)
          .execute(),
      ).toHaveLength(1);
    } finally {
      await db.deleteFrom('workspaces').where('id', '=', space).execute();
    }
  });

  it('does not list or authorize the reserved system workspace even with a stray membership', async () => {
    const system = await fixtures.systemWorkspace();
    await fixtures.member(system, owner, 'admin');
    expect((await request(`/${system}/policies`)).status).toBe(404);
    expect(
      ((await request('').then((response) => response.json())) as { id: string }[]).some(
        (row) => row.id === system,
      ),
    ).toBe(false);
  });

  it('refuses a member inviting others or promoting itself', async () => {
    const member = await fixtures.user();
    actors.push(member);
    await fixtures.member(workspace, member, 'member');
    const cookie = await userCookie(member);
    const invite = { email: `${member}-guest@example.test`, role: 'admin' };
    expect((await request(`/${workspace}/invitations`, 'POST', invite, cookie)).status).toBe(403);
    const own = `/${workspace}/members/${await memberId(member)}`;
    expect((await request(own, 'PATCH', { role: 'admin' }, cookie)).status).toBe(403);
    expect(
      (
        await db
          .selectFrom('workspace_members')
          .select('role')
          .where('workspace_id', '=', workspace)
          .where('user_id', '=', member)
          .executeTakeFirstOrThrow()
      ).role,
    ).toBe('member');
  });
});

describe('invitation lifecycle and contention', () => {
  let issued: { invitation: { id: string }; token: string };
  it('issues only hashed tokens, rotates them on resend and joins only the matching identity once', async () => {
    const response = await request(`/${workspace}/invitations`, 'POST', {
      email: `${invitee}@example.test`,
      role: 'member',
    });
    expect(response.status).toBe(201);
    issued = (await response.json()) as typeof issued;
    const stored = await db
      .selectFrom('workspace_invitations')
      .select('token_sha256')
      .where('workspace_id', '=', workspace)
      .where('id', '=', issued.invitation.id)
      .executeTakeFirstOrThrow();
    expect(stored.token_sha256).toBe(hashInvitationToken(issued.token));
    const listed = await request(`/${workspace}/invitations`);
    expect(JSON.stringify(await listed.json())).not.toContain(issued.token);
    const mismatched = await request('/invitations/accept', 'POST', { token: issued.token });
    const absent = await request(
      '/invitations/accept',
      'POST',
      { token: 'nonexistent-token-value' },
      inviteeCookie,
    );
    expect(mismatched.status).toBe(400);
    expect(await mismatched.json()).toMatchObject({
      detail: ((await absent.json()) as { detail: string }).detail,
    });
    const rotated = await request(
      `/${workspace}/invitations/${issued.invitation.id}/resend`,
      'POST',
    );
    const fresh = (await rotated.json()) as typeof issued;
    expect(
      (await request('/invitations/accept', 'POST', { token: issued.token }, inviteeCookie)).status,
    ).toBe(400);
    issued = fresh;
    const acceptances = await Promise.all([
      request('/invitations/accept', 'POST', { token: issued.token }, inviteeCookie),
      request('/invitations/accept', 'POST', { token: issued.token }, inviteeCookie),
    ]);
    expect(acceptances.map((result) => result.status)).toEqual([200, 200]);
    expect(
      await db
        .selectFrom('workspace_members')
        .select('id')
        .where('workspace_id', '=', workspace)
        .where('user_id', '=', invitee)
        .execute(),
    ).toHaveLength(1);
    expect(
      await db
        .selectFrom('security_events')
        .select('id')
        .where('workspace_id', '=', workspace)
        .where('event', '=', 'membership.join')
        .execute(),
    ).toHaveLength(1);
  });

  it('cannot reuse a spent invitation after removal or assign owner through invitation or role edit', async () => {
    expect(
      (await request(`/${workspace}/members/${await memberId(invitee)}`, 'DELETE')).status,
    ).toBe(204);
    expect(
      (await request('/invitations/accept', 'POST', { token: issued.token }, inviteeCookie)).status,
    ).toBe(400);
    expect(
      (
        await request(`/${workspace}/invitations`, 'POST', {
          email: `${invitee}@example.test`,
          role: 'owner',
        })
      ).status,
    ).toBe(422);
    expect(
      (await request(`/${workspace}/members/${await memberId(owner)}`, 'PATCH', { role: 'owner' }))
        .status,
    ).toBe(422);
  });

  it('expires and revokes links uniformly and permits a fresh expired-address slot', async () => {
    const first = await request(`/${workspace}/invitations`, 'POST', {
      email: `${invitee}@example.test`,
      role: 'viewer',
    });
    const expired = (await first.json()) as typeof issued;
    await db
      .updateTable('workspace_invitations')
      .set({ expires_at: new Date(0) })
      .where('workspace_id', '=', workspace)
      .where('id', '=', expired.invitation.id)
      .execute();
    expect(
      (await request('/invitations/accept', 'POST', { token: expired.token }, inviteeCookie))
        .status,
    ).toBe(400);
    expect(
      (await request(`/${workspace}/invitations/${expired.invitation.id}/resend`, 'POST')).status,
    ).toBe(409);
    const second = await request(`/${workspace}/invitations`, 'POST', {
      email: `${invitee}@example.test`,
      role: 'viewer',
    });
    expect(second.status).toBe(201);
    const fresh = (await second.json()) as typeof issued;
    expect(fresh.invitation.id).toBe(expired.invitation.id);
    expect(
      (await request(`/${workspace}/invitations/${fresh.invitation.id}`, 'DELETE')).status,
    ).toBe(204);
    expect(
      (await request('/invitations/accept', 'POST', { token: fresh.token }, inviteeCookie)).status,
    ).toBe(400);
  });

  it('serializes the pending invitation budget for different addresses and duplicate issues', async () => {
    const now = new Date();
    const seeds = Array.from(
      { length: policy.workspaces.max_pending_invitations - 1 },
      (_, index) => ({
        id: randomUUID(),
        workspace_id: workspace,
        email_normalized: `budget-${index}@example.test`,
        role: 'viewer',
        token_sha256: hashInvitationToken(randomUUID()),
        invited_by_user_id: owner,
        expires_at: new Date(now.getTime() + 3600_000),
        accepted_at: null,
        accepted_by_user_id: null,
        revoked_at: null,
        created_at: now,
        updated_at: now,
      }),
    );
    await db.insertInto('workspace_invitations').values(seeds).execute();
    const results = await Promise.all(
      ['one', 'two'].map((suffix) =>
        request(`/${workspace}/invitations`, 'POST', {
          email: `${suffix}@example.test`,
          role: 'viewer',
        }),
      ),
    );
    expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
    await db
      .deleteFrom('workspace_invitations')
      .where('workspace_id', '=', workspace)
      .where('accepted_at', 'is', null)
      .execute();
    const duplicates = await Promise.all(
      [1, 2].map(() =>
        request(`/${workspace}/invitations`, 'POST', {
          email: 'duplicate@example.test',
          role: 'viewer',
        }),
      ),
    );
    expect(duplicates.map((response) => response.status).sort()).toEqual([201, 409]);
  });
});

describe('team members need a plan', () => {
  it('refuses invitations in a workspace without the grant, and joining after it lapses', async () => {
    const trialOwner = await fixtures.user();
    const space = await fixtures.ownedWorkspace(trialOwner, { access: false });
    const account = await billingAccount(db, space);
    // Open, but without the team grant, as a trial is.
    await grant(db, account, { key: 'workspace_access', value: 1, sourceKind: 'override' });
    const cookie = await userCookie(trialOwner);
    const guest = await fixtures.user();
    const body = { email: `${guest}@example.test`, role: 'member' };

    const refused = await request(`/${space}/invitations`, 'POST', body, cookie);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ error: { details: { key: 'team_members' } } });

    const team = await grant(db, account, {
      key: 'team_members',
      value: 1,
      sourceKind: 'plan',
    });
    const issued = await request(`/${space}/invitations`, 'POST', body, cookie);
    expect(issued.status).toBe(201);
    const { token, invitation } = (await issued.json()) as {
      token: string;
      invitation: { id: string };
    };
    await db
      .updateTable('account_grants')
      .set({ valid_until: new Date(Date.now() - 1000) })
      .where('id', '=', team)
      .execute();
    const accept = await request('/invitations/accept', 'POST', { token }, await userCookie(guest));
    expect(accept.status).toBe(403);
    expect(
      await db
        .selectFrom('workspace_members')
        .select('id')
        .where('workspace_id', '=', space)
        .execute(),
    ).toHaveLength(1);
    // Revoking a link never needs the plan.
    expect(
      (await request(`/${space}/invitations/${invitation.id}`, 'DELETE', undefined, cookie)).status,
    ).toBe(204);
  });
});

describe('membership continuity and transactional receipts', () => {
  it('rolls back a role change when its security receipt cannot be appended', async () => {
    const user = await fixtures.user();
    actors.push(user);
    const spaceOwner = await fixtures.user();
    actors.push(spaceOwner);
    const space = await fixtures.ownedWorkspace(spaceOwner);
    await fixtures.member(space, user, 'member');
    const constraint = `pr14_receipt_${randomUUID().replaceAll('-', '')}`;
    await sql`ALTER TABLE security_events ADD CONSTRAINT ${sql.id(constraint)} CHECK (workspace_id <> ${sql.lit(space)}::uuid OR event <> 'membership.role')`.execute(
      db,
    );
    try {
      const response = await request(
        `/${space}/members/${await memberId(user, space)}`,
        'PATCH',
        { role: 'viewer' },
        await userCookie(spaceOwner),
      );
      expect(response.status).toBe(500);
      expect(
        (
          await db
            .selectFrom('workspace_members')
            .select('role')
            .where('workspace_id', '=', space)
            .where('user_id', '=', user)
            .executeTakeFirstOrThrow()
        ).role,
      ).toBe('member');
      expect(
        await db
          .selectFrom('security_events')
          .select('id')
          .where('workspace_id', '=', space)
          .execute(),
      ).toHaveLength(0);
    } finally {
      await sql`ALTER TABLE security_events DROP CONSTRAINT ${sql.id(constraint)}`.execute(db);
    }
  });

  it('cannot transfer ownership to somebody who already owns another workspace', async () => {
    const incoming = await fixtures.user();
    actors.push(incoming);
    await fixtures.ownedWorkspace(incoming);
    await fixtures.member(workspace, incoming, 'admin');
    const response = await request(`/${workspace}/ownership`, 'POST', {
      member_id: await memberId(incoming),
    });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'workspace_limit_exceeded',
    );
    expect(
      (
        await db
          .selectFrom('workspace_members')
          .select('user_id')
          .where('workspace_id', '=', workspace)
          .where('role', '=', 'owner')
          .executeTakeFirstOrThrow()
      ).user_id,
    ).toBe(owner);
    expect(
      await db
        .selectFrom('security_events')
        .select('id')
        .where('workspace_id', '=', workspace)
        .where('event', '=', 'membership.transfer')
        .execute(),
    ).toHaveLength(0);
  });
  it('removes the workspace from a removed member MCP grants and keeps their others', async () => {
    const member = await fixtures.user();
    actors.push(member);
    await fixtures.member(workspace, member, 'member');
    const elsewhere = await fixtures.ownedWorkspace(member);
    const clientId = randomUUID();
    await db
      .insertInto('mcp_oauth_clients')
      .values({
        id: randomUUID(),
        client_id: clientId,
        client_metadata: JSON.stringify({ client_name: 'test' }),
        client_secret_encrypted: '',
        created_at: new Date(),
      })
      .execute();
    const grantId = randomUUID();
    await db
      .insertInto('mcp_oauth_grants')
      .values({
        id: grantId,
        client_id: clientId,
        user_id: member,
        workspace_ids: JSON.stringify([workspace, elsewhere]),
        scopes: JSON.stringify(['citeladder:read']),
        resource: 'https://protocol.example.test/mcp',
        access_token_hash: randomUUID(),
        refresh_token_hash: randomUUID(),
        access_expires_at: new Date(Date.now() + 3600000),
        refresh_expires_at: new Date(Date.now() + 7200000),
        revoked_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
    try {
      expect(
        (await request(`/${workspace}/members/${await memberId(member)}`, 'DELETE')).status,
      ).toBe(204);
      const grant = await db
        .selectFrom('mcp_oauth_grants')
        .select('workspace_ids')
        .where('id', '=', grantId)
        .executeTakeFirstOrThrow();
      expect(grant.workspace_ids).toEqual([elsewhere]);
    } finally {
      await db.deleteFrom('mcp_oauth_clients').where('client_id', '=', clientId).execute();
    }
  });

  it('lets only the owner transfer ownership, not an admin naming themselves', async () => {
    const admin = await fixtures.user();
    actors.push(admin);
    await fixtures.member(workspace, admin, 'admin');
    const seized = await request(
      `/${workspace}/ownership`,
      'POST',
      { member_id: await memberId(admin) },
      await userCookie(admin),
    );
    expect(seized.status).toBe(403);
    const owners = await db
      .selectFrom('workspace_members')
      .select('user_id')
      .where('workspace_id', '=', workspace)
      .where('role', '=', 'owner')
      .execute();
    expect(owners).toEqual([{ user_id: owner }]);
  });

  it('refuses owner removal, demotion and departure; unchanged role emits no receipt', async () => {
    const id = await memberId(owner);
    expect((await request(`/${workspace}/members/${id}`, 'DELETE')).status).toBe(409);
    expect((await request(`/${workspace}/members/${id}`, 'PATCH', { role: 'admin' })).status).toBe(
      409,
    );
    expect((await request(`/${workspace}/members/leave`, 'POST')).status).toBe(409);
    const member = await fixtures.user();
    actors.push(member);
    await fixtures.member(workspace, member, 'member');
    const memberRow = await memberId(member);
    expect(
      (await request(`/${workspace}/members/${memberRow}`, 'PATCH', { role: 'member' })).status,
    ).toBe(200);
    expect(
      await db
        .selectFrom('security_events')
        .select('id')
        .where('workspace_id', '=', workspace)
        .where('event', '=', 'membership.role')
        .execute(),
    ).toHaveLength(0);
    expect(
      (await request(`/${workspace}/members/${memberRow}`, 'PATCH', { role: 'viewer' })).status,
    ).toBe(200);
    expect(
      await db
        .selectFrom('security_events')
        .select('id')
        .where('workspace_id', '=', workspace)
        .where('event', '=', 'membership.role')
        .execute(),
    ).toHaveLength(1);
  });

  it('serializes transfers against removal and preserves exactly one owner', async () => {
    const incoming = await fixtures.user();
    actors.push(incoming);
    await fixtures.member(workspace, incoming, 'member');
    const id = await memberId(incoming);
    const results = await Promise.all([
      request(`/${workspace}/ownership`, 'POST', { member_id: id }),
      request(`/${workspace}/members/${id}`, 'DELETE'),
    ]);
    expect([
      [200, 409],
      [204, 404],
    ]).toContainEqual(results.map((response) => response.status).sort());
    const owners = await db
      .selectFrom('workspace_members')
      .select('id')
      .where('workspace_id', '=', workspace)
      .where('role', '=', 'owner')
      .execute();
    expect(owners).toHaveLength(1);
    if (owners[0]!.id !== (await memberId(owner)))
      await request(
        `/${workspace}/ownership`,
        'POST',
        { member_id: await memberId(owner) },
        await userCookie(incoming),
      );
  });
});

describe('Terms', () => {
  it('keeps revision acceptance idempotent, scoped and append-only, and rejects stale revisions', async () => {
    const old = 'older-approved-revision';
    await db
      .insertInto('policy_acceptances')
      .values({
        id: randomUUID(),
        actor_id: owner,
        workspace_id: workspace,
        terms_revision: old,
        privacy_notice_revision: old,
        context: 'authenticated_onboarding',
        accepted_at: new Date(0),
      })
      .execute();
    expect(
      (
        (await request(`/${workspace}/policies`).then((response) => response.json())) as {
          accepted_at: null;
        }
      ).accepted_at,
    ).toBeNull();
    const body = { terms_revision: policy.auth.terms_revision, accept_terms: true };
    const first = await request(`/${workspace}/policies`, 'POST', body).then((response) =>
      response.json(),
    );
    expect(
      await request(`/${workspace}/policies`, 'POST', body).then((response) => response.json()),
    ).toEqual(first);
    expect(
      (await request(`/${workspace}/policies`, 'POST', { ...body, terms_revision: old })).status,
    ).toBe(409);
    expect(
      (await request(`/${workspace}/policies`, 'POST', { ...body, accept_terms: false })).status,
    ).toBe(422);
    expect(
      await db
        .selectFrom('policy_acceptances')
        .select('id')
        .where('workspace_id', '=', workspace)
        .where('actor_id', '=', owner)
        .execute(),
    ).toHaveLength(2);
    expect(
      await db
        .selectFrom('security_events')
        .select('id')
        .where('workspace_id', '=', workspace)
        .where('event', '=', 'policy.accept')
        .execute(),
    ).toHaveLength(1);
    expect(
      (
        (await request(`/${workspace}/policies`, 'GET', undefined, viewerCookie).then((response) =>
          response.json(),
        )) as { accepted_at: null }
      ).accepted_at,
    ).toBeNull();
  });
});
