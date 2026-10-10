import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { testConfig, testDatabase } from './support.ts';
import { registerUser, authenticateUser, issueSession } from '../src/auth/service.ts';
import { requestChallenge, consumeChallenge } from '../src/auth/challenges.ts';
import { provisionAccount } from '../src/workspaces/service.ts';
import { workspaceAccess } from '../src/entitlements/access.ts';
import { startSignIn, completeSignIn } from '../src/auth/oauth.ts';
import { createApp } from '../src/app.ts';
import { authorizedWorkspaceIds } from '../src/mcp/data.ts';

const config = testConfig({
  PUBLIC_SIGNUP_ENABLED: 'true',
  RESEND_API_KEY: 'test-only-resend',
  AUTH_MAIL_TIMEOUT_MS: '10',
  OAUTH_GOOGLE_ENABLED: 'true',
  OAUTH_GOOGLE_CLIENT_ID: 'test-google',
  OAUTH_GOOGLE_CLIENT_SECRET: 'test-secret',
});
const db = testDatabase(config);
const users: string[] = [];
const password = 'test-password-secure';
const messages: { text: string; to: string[] }[] = [];
config.auth.fetch = async (_url, init) => {
  messages.push(JSON.parse(String(init?.body)));
  return new Response('{}', { status: 200 });
};

async function pending() {
  const email = `${randomUUID()}@example.test`;
  await registerUser(db, email, password);
  const user = await db
    .selectFrom('users')
    .selectAll()
    .where('email', '=', email)
    .executeTakeFirstOrThrow();
  users.push(user.id);
  const workspace = await db
    .selectFrom('workspace_members')
    .select('workspace_id')
    .where('user_id', '=', user.id)
    .executeTakeFirstOrThrow();
  return { user, email, workspaceId: workspace.workspace_id };
}
function mailedToken(email: string) {
  const message = messages.findLast((row) => row.to[0] === email)!;
  const url = new URL(message.text.split('\n')[1]!);
  return new URLSearchParams(url.hash.slice(1)).get('token')!;
}
afterAll(async () => {
  for (const id of users) {
    const spaces = await db
      .selectFrom('workspace_members')
      .select('workspace_id')
      .where('user_id', '=', id)
      .execute();
    for (const row of spaces)
      await db.deleteFrom('workspaces').where('id', '=', row.workspace_id).execute();
    await db.deleteFrom('security_events').where('actor_id', '=', id).execute();
    await db.deleteFrom('users').where('id', '=', id).execute();
  }
  await db.destroy();
});

describe('verified self-serve lifecycle', () => {
  it('cannot store an identity whose registration provenance is unknown', async () => {
    const { user } = await pending();
    await expect(
      db
        .updateTable('users')
        .set({ registration_origin: 'unknown', email_verified_at: new Date() })
        .where('id', '=', user.id)
        .execute(),
    ).rejects.toThrow(/ck_user_registration_origin/u);
  });
  it('denies expired REST and evidence access while preserving account recovery', async () => {
    const { user, workspaceId } = await pending();
    const verified = await db
      .updateTable('users')
      .set({ email_verified_at: new Date() })
      .where('id', '=', user.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    const cookie = `${config.session.cookieName}=${await issueSession(config, verified)}`;
    const headers = { Cookie: cookie, 'X-Workspace-Id': workspaceId };
    const app = createApp(config, db);
    const principal = {
      kind: 'member' as const,
      userId: user.id,
      workspaceId,
      projectId: randomUUID(),
    };
    expect(await authorizedWorkspaceIds(db, principal)).toEqual([workspaceId]);
    // Move the complete fixture cohort across its immutable seven-day boundary.
    const account = await db
      .selectFrom('billing_accounts')
      .select('id')
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirstOrThrow();
    await db
      .updateTable('account_grants')
      .set({
        valid_from: new Date(Date.now() - 8 * 86400000),
        valid_until: new Date(Date.now() - 86400000),
      })
      .where('billing_account_id', '=', account.id)
      .execute();
    const denied = await app.request('/api/v1/projects', { headers });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: { code: 'trial_expired' } });
    expect(await authorizedWorkspaceIds(db, principal)).toEqual([]);
    expect((await app.request('/api/v1/auth/security', { headers })).status).toBe(200);
    expect((await app.request('/api/v1/workspaces', { headers })).status).toBe(200);
  });
  it('requires both mailbox and signup password, consumes once and never creates a link session', async () => {
    const { user, email } = await pending();
    await expect(authenticateUser(db, email, password)).rejects.toMatchObject({
      code: 'email_verification_required',
    });
    expect(await authenticateUser(db, email, 'wrong-password')).toBeNull();
    const app = createApp(config, db);
    const session = await issueSession(config, user);
    expect(
      (
        await app.request('/api/v1/auth/me', {
          headers: { Cookie: `${config.session.cookieName}=${session}` },
        })
      ).status,
    ).toBe(401);
    await requestChallenge(db, config, email, 'verification');
    const token = mailedToken(email);
    expect((await app.request(`/api/v1/auth/verify-email?token=${token}`)).status).toBe(405);
    await expect(
      consumeChallenge(db, token, 'wrong-password', 'verification'),
    ).rejects.toMatchObject({ code: 'auth_challenge_invalid' });
    await expect(consumeChallenge(db, token, password, 'password_reset')).rejects.toMatchObject({
      code: 'auth_challenge_invalid',
    });
    const results = await Promise.allSettled([
      consumeChallenge(db, token, password, 'verification'),
      consumeChallenge(db, token, password, 'verification'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await authenticateUser(db, email, password))?.id).toBe(user.id);
  });

  it('password recovery replaces preregistered credentials and invalidates old sessions and links', async () => {
    const { user, email } = await pending();
    await requestChallenge(db, config, email, 'password_reset');
    const token = mailedToken(email);
    await consumeChallenge(db, token, 'new-owner-password', 'password_reset');
    expect(await authenticateUser(db, email, password)).toBeNull();
    expect((await authenticateUser(db, email, 'new-owner-password'))?.session_version).toBe(
      user.session_version + 1,
    );
    await expect(
      consumeChallenge(db, token, 'another-password', 'password_reset'),
    ).rejects.toMatchObject({ code: 'auth_challenge_invalid' });
  });

  it('keeps the original trial deadline through repair and denies data exactly at expiry', async () => {
    const { user, workspaceId } = await pending();
    const grant = await db
      .selectFrom('account_grants')
      .innerJoin('billing_accounts', 'billing_accounts.id', 'account_grants.billing_account_id')
      .selectAll('account_grants')
      .where('billing_accounts.workspace_id', '=', workspaceId)
      .where('key', '=', 'workspace_access')
      .executeTakeFirstOrThrow();
    expect(grant.valid_until!.getTime() - user.created_at.getTime()).toBe(7 * 86400000);
    await db.transaction().execute((trx) => provisionAccount(trx, user));
    const grants = await db
      .selectFrom('account_grants')
      .selectAll()
      .where('billing_account_id', '=', grant.billing_account_id)
      .execute();
    expect(grants.every((row) => row.valid_until?.getTime() === grant.valid_until!.getTime())).toBe(
      true,
    );
    expect(
      (await workspaceAccess(db, workspaceId, new Date(grant.valid_until!.getTime() - 1))).status,
    ).toBe('trial_active');
    expect((await workspaceAccess(db, workspaceId, grant.valid_until!)).status).toBe(
      'trial_expired',
    );
  });

  it('does not overwrite duplicate signup credentials or issue a second trial', async () => {
    const { user, email } = await pending();
    await Promise.all([
      registerUser(db, email.toUpperCase(), 'another-password'),
      registerUser(db, email, 'another-password'),
    ]);
    const current = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();
    expect(current.hashed_password).toBe(user.hashed_password);
    expect(current.created_at).toEqual(user.created_at);
  });

  it('Google signup respects the public gate while existing subject login survives it', async () => {
    const email = `${randomUUID()}@gmail.com`;
    const subject = randomUUID();
    const google = {
      ...config,
      auth: {
        ...config.auth,
        fetch: (async (url) =>
          new Response(
            JSON.stringify(
              String(url).includes('userinfo')
                ? { sub: subject, email, email_verified: true }
                : { access_token: 'test' },
            ),
          )) as typeof fetch,
      },
    };
    const closed = { ...google, auth: { ...google.auth, publicSignup: false } };
    const start = await startSignIn(google, 'google');
    await expect(
      completeSignIn(db, closed, 'google', 'code', start.state, start.nonce),
    ).rejects.toMatchObject({ code: 'oauth_signin_disabled' });
    await completeSignIn(db, google, 'google', 'code', start.state, start.nonce);
    const user = await db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirstOrThrow();
    users.push(user.id);
    expect(user.email_verification_method).toBe('google');
    expect(await completeSignIn(db, closed, 'google', 'code', start.state, start.nonce)).toBeTypeOf(
      'string',
    );
  });

  it('authoritative Google proof removes a preregistered password without restarting the trial', async () => {
    const { user, email, workspaceId } = await pending();
    const before = await workspaceAccess(db, workspaceId);
    const google = {
      ...config,
      auth: {
        ...config.auth,
        fetch: (async (url) =>
          new Response(
            JSON.stringify(
              String(url).includes('userinfo')
                ? { sub: randomUUID(), email, email_verified: true, hd: 'example.test' }
                : { access_token: 'test' },
            ),
          )) as typeof fetch,
      },
    };
    const start = await startSignIn(google, 'google');
    await completeSignIn(db, google, 'google', 'code', start.state, start.nonce);
    expect(await authenticateUser(db, email, password)).toBeNull();
    const claimed = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', user.id)
      .executeTakeFirstOrThrow();
    expect(claimed).toMatchObject({
      hashed_password: null,
      email_verification_method: 'google',
      session_version: user.session_version + 1,
    });
    expect(await workspaceAccess(db, workspaceId)).toEqual(before);
  });
});
