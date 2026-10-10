import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { setLogSink } from '../src/logging.ts';
import { Fixtures, testDatabase } from './support.ts';
import {
  catalogMutation,
  grantMutation,
  inspectAccount,
  initializeCatalog,
} from '../src/billing/admin.ts';
import { launchCatalog, catalogDigest, validateCatalog } from '../src/billing/catalog-authoring.ts';
import { billingSettings } from '../src/billing/config.ts';
import {
  ensureWorkspaceBilling,
  provisionWorkspaceBilling,
} from '../src/entitlements/bootstrap.ts';
import { resolveAccountEntitlement } from '../src/entitlements/resolve.ts';

const db = testDatabase(),
  fixtures = new Fixtures(db);
let actorId: string,
  deniedId: string,
  workspaceId: string,
  accountId: string,
  foreignWorkspace: string;
const revisions: string[] = [];
let originallyPublished: string | undefined;
const context = (key = randomUUID(), apply = true) => ({
  actor: `${actorId}@example.test`,
  reason: 'reviewed fixture operation',
  idempotencyKey: key,
  apply,
});
const target = () => ({ workspaceId, accountId });
const authored = (label: string) => ({
  ...launchCatalog({ mode: null, settings: billingSettings({}) }),
  contact_sales_url: `https://example.test/${label}`,
});
beforeAll(async () => {
  actorId = await fixtures.user();
  deniedId = await fixtures.user();
  await db.updateTable('users').set({ role: 'admin' }).where('id', '=', actorId).execute();
  workspaceId = await fixtures.ownedWorkspace(actorId);
  foreignWorkspace = await fixtures.ownedWorkspace(deniedId);
  const actor = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', actorId)
    .executeTakeFirstOrThrow();
  await db.transaction().execute((trx) => ensureWorkspaceBilling(trx, workspaceId, actor));
  accountId = (
    await db
      .selectFrom('billing_accounts')
      .select('id')
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirstOrThrow()
  ).id;
  originallyPublished = (
    await db
      .selectFrom('billing_catalog_revisions')
      .select('revision')
      .where('publication_state', '=', 'published')
      .executeTakeFirst()
  )?.revision;
});
afterAll(async () => {
  if (revisions.length)
    await db.deleteFrom('billing_catalog_revisions').where('revision', 'in', revisions).execute();
  if (originallyPublished)
    await db
      .updateTable('billing_catalog_revisions')
      .set({ publication_state: 'published' })
      .where('revision', '=', originallyPublished)
      .execute();
  await fixtures.cleanup();
  await db.destroy();
});
it('denies unauthorized actors and preview catalog writes leave no durable rows', async () => {
  const revision = `preview-${randomUUID()}`;
  const operation = { kind: 'import' as const, revision, payload: authored(revision) };
  await expect(
    catalogMutation(db, { ...context(), actor: `${deniedId}@example.test` }, operation),
  ).rejects.toThrow('administrator');
  await catalogMutation(db, context(randomUUID(), false), operation);
  expect(
    await db
      .selectFrom('billing_catalog_revisions')
      .select('id')
      .where('revision', '=', revision)
      .execute(),
  ).toEqual([]);
});
it('replays immutable imports, rejects changed requests and serializes competing publications', async () => {
  const a = `a-${randomUUID()}`,
    b = `b-${randomUUID()}`;
  revisions.push(a, b);
  const ctx = context();
  const operation = { kind: 'import' as const, revision: a, payload: authored(a) };
  await catalogMutation(db, ctx, operation);
  await catalogMutation(db, ctx, operation);
  await expect(
    catalogMutation(db, ctx, { ...operation, payload: authored('conflict') }),
  ).rejects.toThrow('revision_conflict');
  await expect(catalogMutation(db, ctx, { ...operation, revision: b })).rejects.toThrow(
    'idempotency_conflict',
  );
  await catalogMutation(db, context(), { kind: 'import', revision: b, payload: authored(b) });
  await catalogMutation(db, context(randomUUID(), false), { kind: 'publish', revision: a });
  expect(
    (
      await db
        .selectFrom('billing_catalog_revisions')
        .select('publication_state')
        .where('revision', '=', a)
        .executeTakeFirstOrThrow()
    ).publication_state,
  ).toBe('draft');
  const publishA = context(),
    publishB = context();
  await Promise.all([
    catalogMutation(db, publishA, { kind: 'publish', revision: a }),
    catalogMutation(db, publishB, { kind: 'publish', revision: b }),
  ]);
  const rows = await db
    .selectFrom('billing_catalog_revisions')
    .selectAll()
    .where('revision', 'in', [a, b])
    .execute();
  expect(rows.filter((r) => r.publication_state === 'published')).toHaveLength(1);
  const retired = rows.find((r) => r.publication_state === 'retired')!;
  await expect(
    catalogMutation(db, context(), { kind: 'publish', revision: retired.revision }),
  ).rejects.toThrow('forward_publication');
  const published = rows.find((r) => r.publication_state === 'published')!;
  const replayCtx = published.revision === a ? publishA : publishB;
  await catalogMutation(db, replayCtx, { kind: 'publish', revision: published.revision });
  expect(
    (
      await db
        .selectFrom('billing_catalog_revisions')
        .select('published_at')
        .where('id', '=', published.id)
        .executeTakeFirstOrThrow()
    ).published_at,
  ).toEqual(published.published_at);
});
it('issues and revokes once, exposes same-transaction projection, and enforces expiry and workspace scope', async () => {
  const from = new Date(Date.now() - 10000),
    until = new Date(Date.now() + 60000);
  const operation = { kind: 'grant' as const, key: 'monitored_urls', value: 100, from, until };
  const ctx = context();
  const version = async () =>
    (
      await db
        .selectFrom('billing_accounts')
        .select('entitlement_lifecycle_version')
        .where('id', '=', accountId)
        .executeTakeFirstOrThrow()
    ).entitlement_lifecycle_version;
  const initialVersion = await version();
  const baseline = await resolveAccountEntitlement(db, target(), new Date());
  const baselineLimit = baseline.status === 'resolved' && baseline.values.get('monitored_urls');
  expect(typeof baselineLimit).toBe('number');
  const previewRecords: unknown[] = [];
  const previousSink = setLogSink((line) => previewRecords.push(JSON.parse(line)));
  try {
    await grantMutation(db, { ...ctx, apply: false }, target(), operation);
  } finally {
    setLogSink(previousSink);
  }
  expect(previewRecords).toContainEqual(
    expect.objectContaining({ event: 'billing.override_grant_previewed', dry_run: true }),
  );
  expect(await version()).toBe(initialVersion);
  await expect(
    grantMutation(db, ctx, { ...target(), workspaceId: foreignWorkspace }, operation),
  ).rejects.toThrow();
  await expect(
    grantMutation(db, context(), target(), { ...operation, key: 'provider.copilot' }),
  ).rejects.toThrow('invalid');
  const issued = await grantMutation(db, ctx, target(), operation);
  await grantMutation(db, ctx, target(), operation);
  expect(await version()).toBe(initialVersion + 1);
  await expect(grantMutation(db, ctx, target(), { ...operation, value: 200 })).rejects.toThrow(
    'idempotency_conflict',
  );
  const effective = await resolveAccountEntitlement(db, { workspaceId, accountId }, new Date());
  expect(effective.status === 'resolved' && effective.values.get('monitored_urls')).toBe(
    Number(baselineLimit) + 100,
  );
  const expired = await resolveAccountEntitlement(db, { workspaceId, accountId }, until);
  expect(expired.status === 'resolved' && expired.values.get('monitored_urls')).toBe(baselineLimit);
  const grantId = issued.grant_ids?.[0] ?? '';
  const revoked = { kind: 'revoke' as const, grantId, at: new Date() };
  const revokeCtx = context();
  await grantMutation(db, revokeCtx, target(), revoked);
  await grantMutation(db, revokeCtx, target(), revoked);
  expect(await version()).toBe(initialVersion + 2);
  expect(
    (
      await db
        .selectFrom('workspace_site_health_runtime')
        .select('monitored_url_limit')
        .where('workspace_id', '=', workspaceId)
        .executeTakeFirstOrThrow()
    ).monitored_url_limit,
  ).toBe(baselineLimit);
  await expect(
    grantMutation(db, revokeCtx, target(), { ...revoked, at: new Date(revoked.at.getTime() + 1) }),
  ).rejects.toThrow('idempotency_conflict');
  const another = await grantMutation(db, context(), target(), {
    ...operation,
    key: 'ai_credits',
    value: 10,
  });
  await expect(
    grantMutation(db, revokeCtx, target(), { ...revoked, grantId: another.grant_ids![0]! }),
  ).rejects.toThrow('revocation_idempotency_conflict');
  await expect(
    inspectAccount(db, context(), { workspaceId: foreignWorkspace, accountId }),
  ).rejects.toThrow();
});
it('concurrent baseline repair freezes cohort and development top-ups stay in one workspace', async () => {
  // A development top-up targets the operator's own workspace; a person owns
  // one, so this operator is fresh.
  const operator = await fixtures.user();
  await db.updateTable('users').set({ role: 'admin' }).where('id', '=', operator).execute();
  const owned = await fixtures.ownedWorkspace(operator, { access: false });
  const actor = await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', operator)
    .executeTakeFirstOrThrow();
  await Promise.all([
    db.transaction().execute((trx) => ensureWorkspaceBilling(trx, owned, actor)),
    db.transaction().execute((trx) => ensureWorkspaceBilling(trx, owned, actor)),
  ]);
  const account = await db
    .selectFrom('billing_accounts')
    .selectAll()
    .where('workspace_id', '=', owned)
    .executeTakeFirstOrThrow();
  const input = {
    actor: `${operator}@example.test`,
    workspaceId: owned,
    reason: 'development fixture',
    apply: true,
    developmentAllowance: 100,
  };
  await provisionWorkspaceBilling(db, input);
  await provisionWorkspaceBilling(db, input);
  const records: unknown[] = [];
  const previousSink = setLogSink((line) => records.push(JSON.parse(line)));
  try {
    await provisionWorkspaceBilling(db, { ...input, developmentAllowance: 150 });
  } finally {
    setLogSink(previousSink);
  }
  expect(records).toContainEqual(
    expect.objectContaining({
      event: 'billing.override_grant_issued',
      actor_id: operator,
      account_id: account.id,
      reason: input.reason,
      dry_run: false,
    }),
  );
  const resolved = await resolveAccountEntitlement(
    db,
    { workspaceId: owned, accountId: account.id },
    new Date(),
  );
  const original = await resolveAccountEntitlement(db, target(), new Date());
  const baselineLimit = original.status === 'resolved' && original.values.get('monitored_urls');
  expect(typeof baselineLimit).toBe('number');
  expect(resolved.status === 'resolved' && resolved.values.get('monitored_urls')).toBe(
    Number(baselineLimit) + 150,
  );
  expect(
    (
      await db
        .selectFrom('billing_accounts')
        .select('registration_cohort_at')
        .where('id', '=', account.id)
        .executeTakeFirstOrThrow()
    ).registration_cohort_at,
  ).toEqual(actor.created_at);
});
it('requires a persisted active admin even when initial catalog already exists', async () => {
  await expect(initializeCatalog(db, 'missing@example.test', null)).rejects.toThrow(
    'administrator',
  );
  await expect(initializeCatalog(db, `${deniedId}@example.test`, null)).rejects.toThrow(
    'administrator',
  );
});

it('rejects reattributing bootstrap imports and preserves previously published runtime terms', async () => {
  const revision = `bootstrap-${randomUUID()}`;
  revisions.push(revision);
  const payload = authored(revision);
  await db
    .insertInto('billing_catalog_revisions')
    .values({
      id: randomUUID(),
      revision,
      payload: JSON.stringify(payload),
      payload_sha256: catalogDigest(payload),
      publication_state: 'draft',
      created_by_user_id: actorId,
      created_reason: 'original bootstrap',
      created_at: new Date(),
    })
    .execute();
  await expect(
    catalogMutation(db, context(), { kind: 'import', revision, payload }),
  ).rejects.toThrow('catalog_bootstrap_revision_exists');
  const original = await db
    .selectFrom('billing_catalog_revisions')
    .selectAll()
    .where('revision', '=', revision)
    .executeTakeFirstOrThrow();
  expect(original.created_idempotency_key).toBeNull();
  expect(original.created_reason).toBe('original bootstrap');
  // The historical runtime shape supports HTTP contacts; new authoring requires HTTPS.
  payload.support_contact!.contact_url = 'http://example.test/legacy';
  expect(() => validateCatalog(payload)).toThrow();
  await db
    .updateTable('billing_catalog_revisions')
    .set({ publication_state: 'retired' })
    .where('publication_state', '=', 'published')
    .execute();
  await db
    .updateTable('billing_catalog_revisions')
    .set({ payload: JSON.stringify(payload), publication_state: 'published' })
    .where('revision', '=', revision)
    .execute();
  expect((await initializeCatalog(db, `${actorId}@example.test`, null)).revision).toBe(revision);
});
