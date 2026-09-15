import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';

import { mswServer } from '@/test/msw-server';
import { agentApi, agentTaskRunSchema } from './agent';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const summary = {
  id: RUN_ID,
  project_id: PROJECT_ID,
  task_type: 'explain',
  objective: 'Explain the latest evidence.',
  status: 'completed',
  error_code: '',
  error_detail: '',
  attempt_count: 1,
  completed_at: '2026-08-09T00:00:01Z',
  cancelled_at: null,
  created_at: '2026-08-09T00:00:00Z',
  updated_at: '2026-08-09T00:00:01Z',
};
const detail = {
  ...summary,
  result: {
    summary: 'Latest saved evidence is available.',
    observations: [],
    roadmap_items: [],
    limitations: [],
    sources: [
      {
        key: 'site_health',
        label: 'Site Health',
        availability: 'available',
        window: null,
        coverage: null,
        reason: null,
      },
    ],
    artifact_refs: [],
  },
};

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('Growth Agent task API', () => {
  it('cancels in the requested workspace without sending request options as a body', async () => {
    const workspaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    let received: { workspace: string | null; body: string } | undefined;
    mswServer.use(
      http.post(`/api/v1/agent/tasks/${RUN_ID}/cancel`, async ({ request }) => {
        received = { workspace: request.headers.get('X-Workspace-Id'), body: await request.text() };
        return HttpResponse.json(detail);
      }),
    );
    await agentApi.cancel(PROJECT_ID, RUN_ID, { workspaceId });
    expect(received).toEqual({ workspace: workspaceId, body: '' });
  });
  it('uses a compact history response and fetches typed results only by detail', async () => {
    mswServer.use(
      http.get('/api/v1/agent/tasks', () => HttpResponse.json([summary])),
      http.get(`/api/v1/agent/tasks/${RUN_ID}`, () => HttpResponse.json(detail)),
    );
    const listed = await agentApi.listTasks(PROJECT_ID);
    expect(listed).toEqual([summary]);
    expect(listed[0]).not.toHaveProperty('result');
    expect(await agentApi.getTask(PROJECT_ID, RUN_ID)).toEqual(detail);
  });

  it('submits only a fixed task with its idempotency key', async () => {
    let body: unknown;
    mswServer.use(
      http.post('/api/v1/agent/tasks', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(detail, { status: 201 });
      }),
    );
    await agentApi.submitTask(
      { project_id: PROJECT_ID, task_type: 'explain', objective: 'Explain the latest evidence.' },
      'agent-idempotency-key',
    );
    expect(body).toEqual({
      project_id: PROJECT_ID,
      task_type: 'explain',
      objective: 'Explain the latest evidence.',
    });
  });

  it('strips legacy internal execution fields and rejects unsupported task types', () => {
    const parsed = agentTaskRunSchema.parse({
      ...detail,
      attempts: [],
      provider_adapter: 'internal',
    });
    expect(parsed).not.toHaveProperty('attempts');
    expect(parsed).not.toHaveProperty('provider_adapter');
    expect(() => agentTaskRunSchema.parse({ ...detail, task_type: 'create_brief' })).toThrow();
    expect(() =>
      agentTaskRunSchema.parse({
        ...detail,
        result: {
          ...detail.result,
          artifact_refs: [{ kind: 'snapshot', id: 'not-a-uuid' }],
        },
      }),
    ).toThrow();
  });
});
