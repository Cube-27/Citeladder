import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { testConfig, testDatabase, sessionToken } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';
import { auditTenant } from './audit-fixtures.ts';
import { auditRuntime } from '../src/audits/config.ts';
import { createAudits } from '../src/audits/creation.ts';
import { auditInput } from '../src/audits/inputs.ts';
import { auditEvents } from '../src/audits/reads.ts';
import { auditEventFrames, resumeCursor } from '../src/audits/events.ts';
import { auditEventSchema } from '@citeladder/contracts/audit-events';

const config = testConfig({
  AUDIT_SSE_POLL_SECONDS: '0.001',
  AUDIT_SSE_TERMINAL_GRACE_POLLS: '1',
  AUDIT_MAX_EVENT_PAGE: '2',
});
const db = testDatabase(config),
  fixtures = new VisibilityFixtures(db),
  app = createApp(config, db),
  runtime = auditRuntime({});
afterEach(async () => {
  await fixtures.cleanup();
});
afterAll(async () => {
  await db.destroy();
});
async function seed() {
  const t = await auditTenant(db, fixtures);
  const [auditId] = await createAudits(
    db,
    t.workspaceId,
    auditInput.parse({ project_id: t.projectId, prompt_set_id: t.setId, engines: ['chatgpt'] }),
    {},
    runtime,
  );
  return { ...t, auditId };
}
async function request(
  userId: string,
  workspaceId: string,
  path: string,
  method = 'GET',
  body?: unknown,
  headers = {},
) {
  return app.request(`/api/v1/audits${path}`, {
    method,
    headers: {
      cookie: `${config.session.cookieName}=${await sessionToken({ sub: userId, ver: 0 })}`,
      'x-workspace-id': workspaceId,
      'content-type': 'application/json',
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
describe('audit HTTP family cutover', () => {
  it('permits viewer previews and reads, gates mutations, scopes foreign IDs and serves safe downloads', async () => {
    const t = await seed(),
      foreign = await seed(),
      viewer = await fixtures.user();
    await fixtures.member(t.workspaceId, viewer, 'viewer');
    const body = { project_id: t.projectId, prompt_set_id: t.setId, engines: ['chatgpt'] };
    expect((await request(viewer, t.workspaceId, '/estimate', 'POST', body)).status).toBe(200);
    expect((await request(viewer, t.workspaceId, '', 'POST', body)).status).toBe(403);
    expect((await request(viewer, t.workspaceId, `/${t.auditId}/cancel`, 'POST')).status).toBe(403);
    expect((await request(viewer, t.workspaceId, `/${t.auditId}`)).status).toBe(200);
    expect((await request(t.userId, t.workspaceId, `/${foreign.auditId}`)).status).toBe(404);
    expect((await request(t.userId, t.workspaceId, `/${foreign.auditId}/export.csv`)).status).toBe(
      404,
    );
    const csv = await request(viewer, t.workspaceId, `/${t.auditId}/export.csv`);
    expect(csv.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(csv.headers.get('content-disposition')).toBe(
      `attachment; filename="audit-${t.auditId}.csv"`,
    );
    expect((await request(viewer, t.workspaceId, `/${t.auditId}/metrics`)).status).toBe(404);
    // An extra HTTP funding selector cannot change manual BYOK admission.
    const created = await request(t.userId, t.workspaceId, '', 'POST', {
      ...body,
      repetitions: 1,
      credential_mode: 'funded',
    });
    expect(created.status).toBe(201);
    const [run] = (await created.json()) as [{ id: string }];
    const funding = await db
      .selectFrom('audits')
      .select('funding_account_id')
      .where('id', '=', run.id)
      .executeTakeFirstOrThrow();
    expect(funding.funding_account_id).toBeNull();
    expect((await request(t.userId, t.workspaceId, `/${run.id}/cancel`, 'POST')).status).toBe(200);
    expect((await request(t.userId, t.workspaceId, `/${run.id}/cancel`, 'POST')).status).toBe(409);
  });
  it('drains terminal stream pages and uses the same validated envelopes and safe resume cursor as JSON', async () => {
    const t = await seed(),
      foreign = await seed();
    await db
      .updateTable('audits')
      .set({ status: 'completed', completed_at: new Date() })
      .where('id', '=', t.auditId)
      .execute();
    const events = await auditEvents(db, t.workspaceId, t.auditId, undefined, 100);
    const response = await request(t.userId, t.workspaceId, `/${t.auditId}/events?stream=true`);
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    const frames = (await response.text())
      .trim()
      .split('\n\n')
      .map((frame) => {
        const lines = frame.split('\n');
        const event = auditEventSchema.parse(
          JSON.parse(lines.find((line) => line.startsWith('data: '))!.slice(6)),
        );
        expect(lines).toContain(`id: ${event.id}`);
        expect(lines).toContain(`event: ${event.event_type}`);
        return event;
      });
    expect(frames).toEqual(events);
    const headers = { 'last-event-id': events[0]!.id };
    const json = await request(
      t.userId,
      t.workspaceId,
      `/${t.auditId}/events`,
      'GET',
      undefined,
      headers,
    );
    expect(await json.json()).toEqual(events.slice(1, 3));
    const resumed = await request(
      t.userId,
      t.workspaceId,
      `/${t.auditId}/events?stream=true`,
      'GET',
      undefined,
      headers,
    );
    const resumedText = await resumed.text();
    expect(resumedText).not.toContain(`id: ${events[0]!.id}\n`);
    expect(resumedText).toContain(`id: ${events.at(-1)!.id}\n`);
    const other = await auditEvents(db, foreign.workspaceId, foreign.auditId, undefined, 1);
    for (const suffix of ['', '?stream=true']) {
      expect(
        (
          await request(
            t.userId,
            t.workspaceId,
            `/${t.auditId}/events${suffix}`,
            'GET',
            undefined,
            { 'last-event-id': other[0]!.id },
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await request(
            t.userId,
            t.workspaceId,
            `/${t.auditId}/events${suffix}`,
            'GET',
            undefined,
            { 'last-event-id': 'bad' },
          )
        ).status,
      ).toBe(422);
    }
  });
  it('stops a stream on cancellation without polling or retaining a transaction', async () => {
    const t = await seed(),
      signal = new AbortController();
    const frames = auditEventFrames(
      db,
      t.workspaceId,
      t.auditId,
      undefined,
      runtime,
      signal.signal,
    );
    expect((await frames.next()).done).toBe(false);
    signal.abort();
    expect((await frames.next()).done).toBe(true);
    expect(resumeCursor(`{${t.auditId}}`)).toBe(t.auditId);
  });
});
