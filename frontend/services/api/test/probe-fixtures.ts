import { vi } from 'vitest';

import { auditRuntime } from '../src/audits/config.ts';
import { createAudits } from '../src/audits/creation.ts';
import { auditInput } from '../src/audits/inputs.ts';
import { transitionAudit } from '../src/audits/state.ts';
import { policy } from '../src/config.ts';
import { loadWorkerSettings } from '../src/config/analytics.ts';
import type { Database } from '../src/db/database.ts';
import { createModelGateway, gatewaySettings } from '../src/models/gateway.ts';
import { probeLabelling } from '../src/probes/labelling.ts';
import { createTheme } from '../src/projects/themes.ts';
import { AnalyticsWorker } from '../src/workers/analytics-worker.ts';
import { auditTenant } from './audit-fixtures.ts';
import { billingAccount, grant } from './prompt-fixtures.ts';
import type { VisibilityFixtures } from './visibility-fixtures.ts';

export type Tenant = Awaited<ReturnType<typeof auditTenant>>;

export function labeller(
  outputs: { known: unknown; objection: unknown; theme: unknown },
  onCall: (sent: string) => Promise<void> = async () => {},
) {
  const fetch = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
    const sent = String(init?.body ?? '');
    await onCall(sent);
    let content = outputs.theme;
    if (sent.includes('known for?')) content = outputs.known;
    else if (sent.includes('not choose')) content = outputs.objection;
    return Response.json({
      model: 'returned-model',
      choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    });
  });
  const gateway = createModelGateway(
    {
      ...gatewaySettings({}),
      apiKey: 'test-only',
      model: 'test',
      baseUrl: 'https://model.test/v1',
    },
    { fetch, sleep: async () => {} },
  );
  return () => gateway;
}

export function probeFixtures(db: Database, fixtures: VisibilityFixtures) {
  const runtime = auditRuntime({});
  const settings = loadWorkerSettings({});

  async function probeTenant(credits = 1000) {
    const t = await auditTenant(db, fixtures);
    await grant(db, await billingAccount(db, t.workspaceId), { key: 'ai_credits', value: credits });
    const theme = await createTheme(db, t, { name: 'Comfort' });
    const rivalId = await fixtures.competitor(t.projectId, { name: 'Rival Shoes' });
    return { t, themeId: theme.id, rivalId };
  }

  function launch(t: Tenant) {
    return createAudits(
      db,
      t.workspaceId,
      auditInput.parse({
        project_id: t.projectId,
        prompt_set_id: t.setId,
        engines: ['chatgpt', 'google_ai_overview'],
        audit_scope: 'probe',
        random_seed: '7',
      }),
      {},
      runtime,
    );
  }

  async function ended(t: Tenant, auditId: string, status: 'completed' | 'cancelled') {
    const steps = status === 'completed' ? ['running', 'analyzing', 'reporting', status] : [status];
    await db.transaction().execute(async (trx) => {
      for (const step of steps)
        await transitionAudit(trx, t.workspaceId, auditId, step, new Date());
    });
  }

  async function answered(t: Tenant, auditId: string) {
    await db
      .updateTable('audit_tasks')
      .set({ status: 'succeeded', answer_text: 'An answer.', completed_at: new Date() })
      .where('workspace_id', '=', t.workspaceId)
      .where('audit_id', '=', auditId)
      .execute();
    await db
      .updateTable('audits')
      .set({ completed_count: 9, completed_at: new Date() })
      .where('workspace_id', '=', t.workspaceId)
      .where('id', '=', auditId)
      .execute();
    await ended(t, auditId, 'completed');
  }

  async function label(t: Tenant, factory: () => ReturnType<ReturnType<typeof labeller>>) {
    const ids = (
      await db
        .selectFrom('analytics_tasks')
        .select('id')
        .where('workspace_id', '=', t.workspaceId)
        .where('task_kind', '=', policy.probes.task_kind)
        .execute()
    ).map((row) => row.id);
    const worker = new AnalyticsWorker(db, settings, {
      executors: { probe_labelling: probeLabelling(factory) },
      taskScope: { workspaceId: t.workspaceId, taskIds: ids },
    });
    await worker.runUntilIdle();
  }

  return { probeTenant, launch, ended, answered, label };
}

export const first = {
  known: {
    answers: [
      {
        answer: 1,
        points: [
          { theme: 'comfort', quote: '' },
          { theme: 'Funding', quote: '' },
        ],
      },
      { answer: 2, points: [{ theme: 'Comfort', quote: '' }] },
      { answer: 3, points: [] },
    ],
  },
  objection: {
    answers: [
      {
        answer: 1,
        reasons: [
          { group: 'Too expensive', quote: '' },
          { group: 'Fit runs small', quote: '' },
        ],
      },
      { answer: 2, reasons: [{ group: 'too expensive', quote: '' }] },
      {
        answer: 3,
        reasons: [
          { group: 'Fit runs small', quote: '' },
          { group: 'Too Expensive', quote: '' },
        ],
      },
    ],
  },
  theme: {
    answers: [
      { answer: 1, brands: ['Acme Running', 'Rival Shoes'] },
      { answer: 2, brands: ['Rival Shoes', 'Big Co', 'Acme Running'] },
      { answer: 3, brands: ['Rival Shoes'] },
    ],
  },
};
