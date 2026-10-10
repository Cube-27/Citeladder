import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { setAcquisitionControl, acquisitionDomain } from '../src/web-evidence/control.ts';
import { authorizeAcquisition } from '../src/web-evidence/acquisition.ts';
import {
  recordAgreementReference,
  agreementReferenceSchema,
} from '../src/workspaces/enterprise-agreements.ts';
import { Fixtures, testConfig, testDatabase } from './support.ts';
import { sql } from 'kysely';
import { setTimeout as delay } from 'node:timers/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { policy } from '../src/config.ts';
import { hashPassword } from '../src/auth/password.ts';
import { authenticateOperator, manageAccount } from '../src/workspaces/account-manager.ts';

const db = testDatabase(),
  fixtures = new Fixtures(db);
let admin: string, signer: string, workspace: string, foreign: string, cliWorkspace: string;
const email = (id: string) => `${id}@example.test`;
const agreement = () => ({
  workspace_id: workspace,
  signatory_id: signer,
  reference: 'MSA-2026-1',
  document_sha256: 'a'.repeat(64),
  signed_at: '2026-01-01T00:00:00.123456Z',
  authority_verified: true,
});
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-02-01T00:00:00Z'));
  admin = await fixtures.user();
  signer = await fixtures.user();
  await db.updateTable('users').set({ role: 'admin' }).where('id', '=', admin).execute();
  workspace = await fixtures.ownedWorkspace(signer);
  cliWorkspace = await fixtures.joinedWorkspace(signer);
  foreign = await fixtures.ownedWorkspace(await fixtures.user());
});
afterAll(async () => {
  await db.deleteFrom('web_acquisition_controls').where('actor_id', '=', admin).execute();
  await db
    .deleteFrom('enterprise_agreement_references')
    .where('workspace_id', 'in', [workspace, foreign, cliWorkspace])
    .execute();
  await db.deleteFrom('security_events').where('actor_id', 'in', [admin, signer]).execute();
  await fixtures.cleanup();
  await db.destroy();
  vi.useRealTimers();
});

it.each([
  'com',
  'co.uk',
  'https://example.com',
  'example.com:443',
  'example.com/path',
  'user@example.com',
  '-bad.test',
  'bad..test',
  '127.0.0.1',
])('refuses invalid stop scope %s', (domain) => {
  expect(() => acquisitionDomain(domain)).toThrow('bare registrable');
});
it('previews and authorizes stop/resume, propagating parent, IDNA and global stops', async () => {
  const input = { actor: email(admin), domain: 'BÜCHER.test.', reason: 'test-only' };
  expect(acquisitionDomain(input.domain)).toBe('xn--bcher-kva.test');
  await expect(
    setAcquisitionControl(db, { ...input, actor: email(signer), apply: true }),
  ).rejects.toThrow('platform administrator');
  expect(() => setAcquisitionControl(db, { ...input, reason: ' '.repeat(3) })).toThrow('Reason');
  expect(() => setAcquisitionControl(db, { ...input, reason: 'a'.repeat(256) })).toThrow('Reason');
  await setAcquisitionControl(db, input);
  expect(
    await db
      .selectFrom('web_acquisition_controls')
      .selectAll()
      .where('actor_id', '=', admin)
      .execute(),
  ).toEqual([]);
  expect(
    await db.selectFrom('security_events').select('id').where('actor_id', '=', admin).execute(),
  ).toEqual([]);
  await setAcquisitionControl(db, { ...input, apply: true });
  const url = new URL('https://shop.bücher.test/page');
  await expect(authorizeAcquisition(db, url)).rejects.toMatchObject({
    code: 'acquisition_unavailable',
  });
  await expect(authorizeAcquisition(db, new URL('https://other.test'))).resolves.toBeUndefined();
  await setAcquisitionControl(db, { ...input, resume: true, apply: true });
  await expect(authorizeAcquisition(db, url)).resolves.toBeUndefined();
  await setAcquisitionControl(db, { ...input, domain: '*', apply: true });
  await expect(authorizeAcquisition(db, url)).rejects.toMatchObject({
    code: 'acquisition_unavailable',
  });
  await setAcquisitionControl(db, { ...input, domain: '*', resume: true, apply: true });
  await expect(authorizeAcquisition(db, url)).resolves.toBeUndefined();
  expect(
    await db
      .selectFrom('security_events')
      .select('event')
      .where('actor_id', '=', admin)
      .where('event', '=', 'acquisition.control')
      .execute(),
  ).toHaveLength(4);
  await db.updateTable('users').set({ is_active: false }).where('id', '=', admin).execute();
  await expect(setAcquisitionControl(db, { ...input, apply: true })).rejects.toThrow(
    'platform administrator',
  );
  await db.updateTable('users').set({ is_active: true }).where('id', '=', admin).execute();
});

it('requires active operator and signatory authority in the exact workspace', async () => {
  await expect(recordAgreementReference(db, email(signer), agreement(), true)).rejects.toThrow(
    'platform administrator',
  );
  await expect(
    recordAgreementReference(db, email(admin), { ...agreement(), workspace_id: foreign }, true),
  ).rejects.toThrow('target workspace');
  for (const role of ['member', 'viewer']) {
    await db
      .updateTable('workspace_members')
      .set({ role })
      .where('workspace_id', '=', workspace)
      .where('user_id', '=', signer)
      .execute();
    await expect(recordAgreementReference(db, email(admin), agreement(), true)).rejects.toThrow(
      'target workspace',
    );
  }
  await db
    .updateTable('workspace_members')
    .set({ role: 'owner' })
    .where('workspace_id', '=', workspace)
    .where('user_id', '=', signer)
    .execute();
  await db.updateTable('users').set({ is_active: false }).where('id', '=', signer).execute();
  await expect(recordAgreementReference(db, email(admin), agreement(), true)).rejects.toThrow(
    'target workspace',
  );
  await db.updateTable('users').set({ is_active: true }).where('id', '=', signer).execute();
  await db.updateTable('users').set({ is_active: false }).where('id', '=', admin).execute();
  await expect(recordAgreementReference(db, email(admin), agreement(), true)).rejects.toThrow(
    'platform administrator',
  );
  await db.updateTable('users').set({ is_active: true }).where('id', '=', admin).execute();
});

it('reads bounded agreement reference JSON from stdin, previews by default and applies only explicitly', async () => {
  const config = testConfig();
  const input = {
    ...agreement(),
    workspace_id: cliWorkspace,
    reference: 'MSA-stdin',
    signed_at: '1970-01-01T00:00:00Z',
  };
  const run = (json: string, flags: string[] = []) => {
    const running = promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(new URL('../src/cli/enterprise-agreement.ts', import.meta.url)),
        '--actor',
        email(admin),
        ...flags,
      ],
      {
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          APP_ENV: 'test',
          CITELADDER_DISABLE_DOTENV: '1',
          DATABASE_URL: config.databaseUrl,
          JWT_SECRET_KEY: config.session.secretKey,
        },
        windowsHide: true,
        timeout: 10_000,
      },
    );
    running.child.stdin!.end(json);
    return running;
  };
  const rows = () =>
    db
      .selectFrom('enterprise_agreement_references')
      .select('id')
      .where('workspace_id', '=', cliWorkspace)
      .where('reference', '=', input.reference)
      .execute();
  await run(JSON.stringify(input));
  expect(await rows()).toEqual([]);
  await expect(run('not-json', ['--apply'])).rejects.toMatchObject({ code: 1 });
  await expect(
    run(' '.repeat(policy.workspaces.agreement_input_max_bytes + 1), ['--apply']),
  ).rejects.toMatchObject({ code: 1 });
  expect(await rows()).toEqual([]);
  const { stdout } = await run(JSON.stringify(input), ['--apply']);
  expect(JSON.parse(stdout)).toMatchObject({ reference: input.reference, apply: true });
  expect(await rows()).toHaveLength(1);
});

it.each([
  { signed_at: '2026-01-01T00:00:00' },
  { signed_at: '2999-01-01T00:00:00Z' },
  { authority_verified: false },
  { contract_body: 'not accepted' },
  { reference: 'https://archive.test/contract' },
])('refuses unverified, malformed or extra agreement evidence %j', (extra) => {
  expect(agreementReferenceSchema.safeParse({ ...agreement(), ...extra }).success).toBe(false);
});

it('rolls preview evidence back, accepts concurrent identical replay and rejects changed evidence without rewriting history', async () => {
  await recordAgreementReference(db, email(admin), agreement());
  expect(
    await db
      .selectFrom('enterprise_agreement_references')
      .selectAll()
      .where('workspace_id', '=', workspace)
      .execute(),
  ).toEqual([]);
  expect(
    await db
      .selectFrom('security_events')
      .selectAll()
      .where('workspace_id', '=', workspace)
      .execute(),
  ).toEqual([]);
  const [left, right] = await Promise.all([
    recordAgreementReference(
      db,
      email(admin),
      { ...agreement(), workspace_id: workspace.toUpperCase(), signatory_id: signer.toUpperCase() },
      true,
    ),
    recordAgreementReference(db, email(admin), agreement(), true),
  ]);
  expect(left.id).toBe(right.id);
  await expect(
    recordAgreementReference(
      db,
      email(admin),
      { ...agreement(), signatory_id: signer.toUpperCase() },
      true,
    ),
  ).resolves.toMatchObject({ id: left.id });
  await expect(
    recordAgreementReference(
      db,
      email(admin),
      { ...agreement(), signed_at: '2026-01-01T05:30:00.123456+05:30' },
      true,
    ),
  ).resolves.toMatchObject({ id: left.id });
  for (const changed of [
    { document_sha256: 'b'.repeat(64) },
    { signed_at: '2026-01-01T00:00:00.123457Z' },
    { signatory_id: admin },
  ]) {
    if ('signatory_id' in changed) await fixtures.member(workspace, admin, 'admin');
    await expect(
      recordAgreementReference(db, email(admin), { ...agreement(), ...changed }, true),
    ).rejects.toThrow('different signed evidence');
  }
  expect(
    await db
      .selectFrom('enterprise_agreement_references')
      .selectAll()
      .where('workspace_id', '=', workspace)
      .execute(),
  ).toHaveLength(1);
  expect(
    await db
      .selectFrom('security_events')
      .select('target_id')
      .where('workspace_id', '=', workspace)
      .execute(),
  ).toEqual([{ target_id: left.id }]);
  expect(
    await db
      .selectFrom('policy_acceptances')
      .select('id')
      .where('workspace_id', '=', workspace)
      .execute(),
  ).toEqual([]);
});

it('serializes account authorization before row locks while agreement recording holds the same admin', async () => {
  await db
    .updateTable('users')
    .set({ hashed_password: await hashPassword('password123') })
    .where('id', '=', admin)
    .execute();
  const session = await authenticateOperator(db, email(admin), workspace, 'password123');
  const actorLocked = Promise.withResolvers<void>(),
    releaseActor = Promise.withResolvers<void>();
  let paused = false;
  // Pause the actual agreement command after its admin row has been locked.
  const recordingDb = db.withPlugin({
    transformQuery: ({ node }) => node,
    transformResult: async ({ result }) => {
      if (!paused && result.rows.some((row) => row.id === admin && row.role === 'admin')) {
        paused = true;
        actorLocked.resolve();
        await releaseActor.promise;
      }
      return result;
    },
  });
  const recording = recordAgreementReference(
    recordingDb,
    email(admin),
    { ...agreement(), reference: 'MSA-lock-order' },
    true,
  );
  await actorLocked.promise;
  const listing = manageAccount(db, session, { kind: 'list' });
  try {
    let waiting = false;
    for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
      const result = await sql<{ waiting: boolean }>`select exists (
        select 1 from pg_locks l join pg_stat_activity a on a.pid = l.pid
        where a.datname = current_database() and l.locktype = 'advisory' and not l.granted
      ) as waiting`.execute(db);
      waiting = result.rows[0]!.waiting;
      if (!waiting) await delay(10);
    }
    expect(waiting).toBe(true);
  } finally {
    releaseActor.resolve();
    await Promise.all([recording, listing]);
  }
});
