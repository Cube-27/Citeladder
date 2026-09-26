import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';

import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

const mocks = vi.hoisted(() => ({ saveBlob: vi.fn() }));
vi.mock('@/lib/download', () => ({ saveBlob: mocks.saveBlob }));
vi.mock('@/lib/billing/entitlement-context', () => ({
  useEntitlement: () => ({ hasCapability: () => true }),
}));

import { ChatScreen } from './chat-screen';
import { OutputHistory } from './output-history';
import { queryKeys } from '@/lib/api/query-keys';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const CHAT = '22222222-2222-4222-8222-222222222222';
const OUTPUT = '33333333-3333-4333-8333-333333333333';
const REV1 = '44444444-4444-4444-8444-444444444441';
const REV2 = '44444444-4444-4444-8444-444444444442';
const RUN = '55555555-5555-4555-8555-555555555555';
const NOW = '2026-09-25T10:00:00Z';

function revision(id: string, number: number, author: 'agent' | 'user', body: string) {
  return {
    id,
    number,
    parent_revision_id: number > 1 ? REV1 : null,
    author,
    phase: 'final' as const,
    title: 'Pricing page edits',
    body,
    source_refs: ['citeladder://opportunity/66666666-6666-4666-8666-666666666666'],
    approved_at: null,
    created_at: NOW,
  };
}

function detail(
  latest: ReturnType<typeof revision>,
  run: { status: string; error_code?: string } = { status: 'succeeded' },
) {
  return {
    chat: {
      id: CHAT,
      project_id: PROJECT,
      action_id: null,
      target_label: null,
      title: 'Improve pricing snippet',
      turn_count: 1,
      output_kind: 'page_edits',
      output_phase: 'final',
      last_activity_at: NOW,
      created_at: NOW,
    },
    pinned_skill_id: null,
    context: {},
    messages: [
      {
        id: '77777777-7777-4777-8777-777777777771',
        sequence: 1,
        role: 'user',
        content: 'Improve our pricing page snippet.',
        skill_id: null,
        skill_source: null,
        evidence_refs: [],
        steps: [],
        created_at: NOW,
      },
      {
        id: '77777777-7777-4777-8777-777777777772',
        sequence: 2,
        role: 'agent',
        content: 'Here are the edits.',
        skill_id: 'gsc_optimize',
        skill_source: 'model',
        evidence_refs: [],
        steps: [
          { kind: 'skill', skill_id: 'gsc_optimize' },
          { kind: 'tool', tool: 'read_integration_status', status: 'completed' },
        ],
        created_at: NOW,
      },
    ],
    latest_run: {
      id: RUN,
      status: run.status,
      mode: 'turn',
      skill_id: 'gsc_optimize',
      skill_source: 'model',
      steps_used: 2,
      error_code: run.error_code ?? '',
      error_detail: '',
      created_at: NOW,
      completed_at: NOW,
    },
    output: {
      id: OUTPUT,
      action_id: null,
      kind: 'page_edits',
      skill_id: 'gsc_optimize',
      format_id: null,
      target_kind: null,
      target_label: null,
      phase: 'final',
      latest_revision: latest,
    },
  };
}

const skills = {
  skills: [
    {
      id: 'gsc_optimize',
      label: 'Search Console optimization',
      group: 'owned_site',
      output_kind: 'page_edits',
      description: 'Title and snippet edits.',
    },
  ],
};

function renderChat() {
  return renderWithProviders(
    <Routes>
      <Route path="/agent/chats/:chatId" element={<ChatScreen />} />
    </Routes>,
    {
      initialEntries: [`/agent/chats/${CHAT}`],
      projectSelection: {
        activeProjectId: PROJECT,
        activeProject: { id: PROJECT } as never,
        status: 'ready',
      },
    },
  );
}

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  mswServer.resetHandlers();
  mocks.saveBlob.mockReset();
});
afterAll(() => mswServer.close());

describe('ChatScreen', () => {
  it('refreshes history for a new latest revision and retains prefix invalidation', async () => {
    let items = [revision(REV1, 1, 'agent', 'First draft')];
    mswServer.use(
      http.get(`/api/v1/agent/chats/${CHAT}/output/revisions`, () => HttpResponse.json({ items })),
    );
    const { rerender, queryClient } = renderWithProviders(
      <OutputHistory
        workspaceId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        chatId={CHAT}
        latestRevisionId={REV1}
        canRestore={false}
      />,
    );
    expect(await screen.findByText('Revision 1')).toBeVisible();
    items = [...items, revision(REV2, 2, 'agent', 'Second draft')];
    rerender(
      <OutputHistory
        workspaceId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        chatId={CHAT}
        latestRevisionId={REV2}
        canRestore={false}
      />,
    );
    expect(await screen.findByText('Revision 2')).toBeVisible();
    items = [
      ...items,
      revision('44444444-4444-4444-8444-444444444443', 3, 'user', 'Restored draft'),
    ];
    await act(() => queryClient.invalidateQueries({ queryKey: queryKeys.agent.revisions(CHAT) }));
    expect(await screen.findByText('Revision 3')).toBeVisible();
  });
  it('saves an edit as a new revision and reopens the pane on the latest one', async () => {
    let current = detail(revision(REV1, 1, 'agent', 'Old title tag.'));
    const edits: unknown[] = [];
    mswServer.use(
      http.get('/api/v1/agent/skills', () => HttpResponse.json(skills)),
      http.get(`/api/v1/agent/chats/${CHAT}`, () => HttpResponse.json(current)),
      http.post(`/api/v1/agent/chats/${CHAT}/output/revisions`, async ({ request }) => {
        edits.push(await request.json());
        const saved = revision(REV2, 2, 'user', 'New title tag.');
        current = detail(saved);
        return HttpResponse.json(saved, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderChat();

    const pane = await screen.findByRole('region', { name: 'Pricing page edits' });
    expect(within(pane).getByText('Revision 1')).toBeVisible();
    expect(await screen.findByText('Skill: Search Console optimization')).toBeVisible();

    await user.click(within(pane).getByRole('button', { name: 'Edit' }));
    const body = within(pane).getByLabelText('Output body (Markdown)');
    await user.clear(body);
    await user.type(body, 'New title tag.');
    await user.click(within(pane).getByRole('button', { name: 'Save as new revision' }));

    expect(await within(pane).findByText('Revision 2')).toBeVisible();
    expect(edits).toEqual([
      { base_revision_id: REV1, title: 'Pricing page edits', body: 'New title tag.' },
    ]);

    await user.click(within(pane).getByRole('button', { name: 'Close output' }));
    expect(screen.queryByRole('region', { name: 'Pricing page edits' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Pricing page edits.*Revision 2/ }));
    expect(
      within(screen.getAllByRole('region', { name: 'Pricing page edits' })[0]).getByText(
        'New title tag.',
      ),
    ).toBeVisible();
  });

  it('keeps an unsaved edit when switching output tabs', async () => {
    mswServer.use(
      http.get('/api/v1/agent/skills', () => HttpResponse.json(skills)),
      http.get(`/api/v1/agent/chats/${CHAT}`, () =>
        HttpResponse.json(detail(revision(REV1, 1, 'agent', 'Old title tag.'))),
      ),
    );
    const user = userEvent.setup();
    renderChat();

    const pane = await screen.findByRole('region', { name: 'Pricing page edits' });
    await user.click(within(pane).getByRole('button', { name: 'Edit' }));
    await user.type(within(pane).getByLabelText('Output body (Markdown)'), ' Draft.');
    await user.click(within(pane).getByRole('tab', { name: 'Sources' }));
    await user.click(within(pane).getByRole('tab', { name: 'Final' }));

    expect(within(pane).getByLabelText('Output body (Markdown)')).toHaveValue(
      'Old title tag. Draft.',
    );
  });

  it('retries a failed send with the same idempotency key', async () => {
    const keys: (string | null)[] = [];
    mswServer.use(
      http.get('/api/v1/agent/skills', () => HttpResponse.json(skills)),
      http.get(`/api/v1/agent/chats/${CHAT}`, () =>
        HttpResponse.json(detail(revision(REV1, 1, 'agent', 'Old title tag.'))),
      ),
      http.post(`/api/v1/agent/chats/${CHAT}/messages`, ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'));
        if (keys.length === 1) return HttpResponse.json({ detail: 'Unavailable' }, { status: 503 });
        return HttpResponse.json(
          {
            chat_id: CHAT,
            run: { ...detail(revision(REV1, 1, 'agent', '')).latest_run, status: 'queued' },
          },
          { status: 202 },
        );
      }),
    );
    const user = userEvent.setup();
    renderChat();

    await user.type(await screen.findByLabelText('Reply to the agent'), 'Shorten it.');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await vi.waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });

  it('exports the revision as Markdown', async () => {
    mswServer.use(
      http.get('/api/v1/agent/skills', () => HttpResponse.json(skills)),
      http.get(`/api/v1/agent/chats/${CHAT}`, () =>
        HttpResponse.json(detail(revision(REV1, 1, 'agent', 'Body text.'))),
      ),
    );
    const user = userEvent.setup();
    renderChat();

    const pane = await screen.findByRole('region', { name: 'Pricing page edits' });
    await user.click(within(pane).getByRole('button', { name: 'Export Markdown' }));

    const [blob, filename] = mocks.saveBlob.mock.calls[0] as [Blob, string];
    expect(filename).toBe('pricing-page-edits.md');
    expect(await blob.text()).toBe('# Pricing page edits\n\nBody text.\n');
  });

  it('keeps stopped-at-limit distinct from a failure and locks nothing that saved', async () => {
    mswServer.use(
      http.get('/api/v1/agent/skills', () => HttpResponse.json(skills)),
      http.get(`/api/v1/agent/chats/${CHAT}`, () =>
        HttpResponse.json(
          detail(revision(REV1, 1, 'agent', 'Body.'), {
            status: 'failed',
            error_code: 'stopped_at_limit',
          }),
        ),
      ),
    );
    renderChat();

    expect(await screen.findByText(/stopped at its step limit/i)).toBeVisible();
    expect(screen.queryByText(/could not finish/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make it shorter' })).toBeEnabled();
  });

  it('refuses edits while a turn is running and offers Stop', async () => {
    const cancels: string[] = [];
    mswServer.use(
      http.get('/api/v1/agent/skills', () => HttpResponse.json(skills)),
      http.get(`/api/v1/agent/chats/${CHAT}`, () =>
        HttpResponse.json(detail(revision(REV1, 1, 'agent', 'Body.'), { status: 'running' })),
      ),
      http.post(`/api/v1/agent/chats/${CHAT}/runs/${RUN}/cancel`, ({ params }) => {
        cancels.push(String(params.chatId ?? CHAT));
        return HttpResponse.json({ ...detail(revision(REV1, 1, 'agent', 'x')).latest_run });
      }),
    );
    const user = userEvent.setup();
    renderChat();

    const pane = await screen.findByRole('region', { name: 'Pricing page edits' });
    expect(within(pane).getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(screen.getByLabelText('Reply to the agent')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(cancels).toHaveLength(1);
  });

  it('declares the revision on screen implemented and shows what it waits for', async () => {
    const ACTION = '88888888-8888-4888-8888-888888888888';
    const attached = detail(revision(REV1, 1, 'agent', 'Body.'));
    attached.chat.action_id = ACTION as never;
    attached.output.action_id = ACTION as never;
    const declaration = {
      id: '99999999-9999-4999-8999-999999999999',
      action_id: ACTION,
      output_revision_id: REV1,
      member_opportunity_ids: [],
      opportunity_snapshot_id: RUN,
      target_site_url_ids: [],
      target_external_url: null,
      declared_implemented_at: NOW,
      expected_checks: [],
      state: 'declared',
      limitations: [],
      verification_events: [],
      legs: [
        {
          leg: 'next_crawl',
          state: 'not_scheduled',
          due_at: null,
          last_evidence_at: null,
          source_id: null,
        },
      ],
      created_at: NOW,
    };
    let declared: typeof declaration | null = null;
    const posted: unknown[] = [];
    const action = () => ({
      id: ACTION,
      project_id: PROJECT,
      target_kind: 'page',
      target_label: 'https://acme.test/pricing',
      target_url: 'https://acme.test/pricing',
      target_prompt_id: null,
      origin: 'evidence',
      status: declared ? 'implemented' : 'in_progress',
      priority_score: 40,
      families: ['site_health'],
      approach: 'fix_technical',
      skill_id: 'technical_health',
      member_count: 1,
      evidence_cleared_at: null,
      created_at: NOW,
      updated_at: NOW,
      diagnosis: {},
      members: [],
      declaration: declared,
    });
    mswServer.use(
      http.get('/api/v1/agent/skills', () => HttpResponse.json(skills)),
      http.get(`/api/v1/agent/chats/${CHAT}`, () => HttpResponse.json(attached)),
      http.get(`/api/v1/actions/${ACTION}`, () => HttpResponse.json(action())),
      http.post(`/api/v1/actions/${ACTION}/declaration`, async ({ request }) => {
        posted.push(await request.json());
        declared = declaration;
        return HttpResponse.json(declaration, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderChat();

    const pane = await screen.findByRole('region', { name: 'Pricing page edits' });
    await user.click(await within(pane).findByRole('button', { name: 'Mark implemented' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mark implemented' });
    await user.click(within(dialog).getByRole('button', { name: 'Declare implemented' }));

    expect(await within(pane).findByText(/Crawls run when you start one/)).toBeVisible();
    expect(
      within(pane).queryByRole('button', { name: 'Mark implemented' }),
    ).not.toBeInTheDocument();
    expect(posted).toEqual([
      { output_revision_id: REV1, declared_implemented_at: expect.any(String) },
    ]);
  });
});
