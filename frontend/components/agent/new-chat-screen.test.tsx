import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes, useParams } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';

import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

const entitlement = vi.hoisted(() => ({ agent: true }));
vi.mock('@/lib/billing/entitlement-context', () => ({
  useEntitlement: () => ({ hasCapability: () => entitlement.agent }),
}));

import { NewChatScreen } from './new-chat-screen';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const CHAT = '22222222-2222-4222-8222-222222222222';
const SIGNAL = '33333333-3333-4333-8333-333333333333';
const PAGE = '44444444-4444-4444-8444-444444444444';

function ChatLanding() {
  return <p>Opened chat {useParams().chatId}</p>;
}

function renderNewChat(search: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/agent" element={<NewChatScreen />} />
      <Route path="/agent/chats/:chatId" element={<ChatLanding />} />
    </Routes>,
    {
      initialEntries: [`/agent${search}`],
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
  entitlement.agent = true;
});
afterAll(() => mswServer.close());

const ACCEPTED = {
  chat_id: CHAT,
  run: {
    id: '55555555-5555-4555-8555-555555555555',
    status: 'queued',
    mode: 'turn',
    skill_id: null,
    skill_source: null,
    steps_used: 0,
    error_code: '',
    error_detail: '',
    created_at: '2026-09-25T10:00:00Z',
    completed_at: null,
  },
};

const PRICING = '77777777-7777-4777-8777-777777777771';
const BLOG = '77777777-7777-4777-8777-777777777772';

function actionItem(id: string, label: string) {
  return {
    id,
    project_id: PROJECT,
    target_kind: 'page',
    target_label: label,
    target_url: null,
    target_prompt_id: null,
    origin: 'evidence',
    status: 'open',
    priority_score: 1,
    families: [],
    approach: 'improve_page',
    skill_id: 'gsc_optimize',
    member_count: 1,
    evidence_cleared_at: null,
    created_at: '2026-09-25T10:00:00Z',
    updated_at: '2026-09-25T10:00:00Z',
  };
}

const GROWTH_SKILL = {
  id: 'growth_plan',
  label: 'Growth plan',
  group: 'strategy',
  output_kind: 'plan',
  description: 'Prioritize work.',
};

function baseHandlers(actions: ReturnType<typeof actionItem>[] = []) {
  return [
    http.get('/api/v1/agent/skills', () => HttpResponse.json({ skills: [GROWTH_SKILL] })),
    http.get(`/api/v1/projects/${PROJECT}/actions`, () =>
      HttpResponse.json({ items: actions, next_cursor: null, status_counts: {} }),
    ),
  ];
}

describe('NewChatScreen', () => {
  it('starts a chat from an evidence handoff with only the references left attached', async () => {
    const bodies: unknown[] = [];
    const keys: (string | null)[] = [];
    mswServer.use(
      ...baseHandlers(),
      http.post(`/api/v1/projects/${PROJECT}/agent/chats`, async ({ request }) => {
        bodies.push(await request.json());
        keys.push(request.headers.get('Idempotency-Key'));
        return HttpResponse.json(ACCEPTED, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    renderNewChat(
      `?demand_signal_id=${SIGNAL}&target_site_url_id=${PAGE}&prompt=Why%20did%20clicks%20drop%3F`,
    );

    const message = await screen.findByLabelText('Message the agent');
    expect(message).toHaveValue('Why did clicks drop?');
    await user.click(screen.getByRole('button', { name: 'Remove Selected page' }));
    expect(screen.queryByText('Selected page')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText(`Opened chat ${CHAT}`)).toBeInTheDocument();
    expect(bodies).toEqual([
      { message: 'Why did clicks drop?', context: { demand_signal_id: SIGNAL } },
    ]);
    expect(keys[0]).toBeTruthy();
  });

  it('starts without an attached Action that could not be loaded', async () => {
    const action = '66666666-6666-4666-8666-666666666666';
    const bodies: unknown[] = [];
    mswServer.use(
      ...baseHandlers(),
      http.get(`/api/v1/actions/${action}`, () =>
        HttpResponse.json({ detail: 'Action not found' }, { status: 404 }),
      ),
      http.post(`/api/v1/projects/${PROJECT}/agent/chats`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(ACCEPTED, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    renderNewChat(`?action_id=${action}&prompt=Plan%20this`);

    expect(await screen.findByText(/This Action is unavailable/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText(`Opened chat ${CHAT}`)).toBeInTheDocument();
    expect(bodies).toEqual([{ message: 'Plan this', context: {} }]);
  });

  it('explains a plan without the agent instead of offering to send', async () => {
    entitlement.agent = false;
    mswServer.use(...baseHandlers());
    renderNewChat('');

    expect(await screen.findByText(/plan does not include the agent/i)).toBeVisible();
    expect(screen.getByLabelText('Message the agent')).toBeDisabled();
  });

  it('picks a skill with / and mentions an Action with @', async () => {
    const bodies: unknown[] = [];
    mswServer.use(
      ...baseHandlers([actionItem(PRICING, 'Pricing page'), actionItem(BLOG, 'Blog hub')]),
      http.post(`/api/v1/projects/${PROJECT}/agent/chats`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(ACCEPTED, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    renderNewChat('');

    const message = await screen.findByLabelText('Message the agent');
    await user.type(message, '/grow');
    expect(await screen.findByRole('option', { name: /Growth plan/ })).toBeVisible();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Skill: Growth plan' })).toBeVisible();
    await user.type(message, 'Compare @pric');
    await user.click(await screen.findByRole('option', { name: /Pricing page/ }));
    expect(message).toHaveValue('Compare @Pricing page ');
    expect(screen.getByRole('button', { name: 'Remove @Pricing page' })).toBeVisible();
    await user.type(message, 'and last month{Enter}');

    expect(await screen.findByText(`Opened chat ${CHAT}`)).toBeInTheDocument();
    expect(bodies).toEqual([
      {
        message: 'Compare @Pricing page and last month',
        skill_id: 'growth_plan',
        context: {},
        mentions: [PRICING],
      },
    ]);
  });

  it('closes the command menu on Escape so Enter sends the message', async () => {
    const bodies: unknown[] = [];
    mswServer.use(
      ...baseHandlers(),
      http.post(`/api/v1/projects/${PROJECT}/agent/chats`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(ACCEPTED, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    renderNewChat('');

    const message = await screen.findByLabelText('Message the agent');
    await user.type(message, 'Use /grow');
    expect(await screen.findByRole('option', { name: /Growth plan/ })).toBeVisible();
    await user.keyboard('{Escape}{Enter}');

    expect(await screen.findByText(`Opened chat ${CHAT}`)).toBeInTheDocument();
    expect(bodies).toEqual([{ message: 'Use /grow', context: {} }]);
  });

  it('briefs on the top open Actions with the growth plan skill', async () => {
    const bodies: unknown[] = [];
    mswServer.use(
      ...baseHandlers([actionItem(PRICING, 'Pricing page'), actionItem(BLOG, 'Blog hub')]),
      http.post(`/api/v1/projects/${PROJECT}/agent/chats`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(ACCEPTED, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    renderNewChat('');

    const briefing = await screen.findByRole('region', { name: 'What should I work on?' });
    expect(await within(briefing).findByText(/top 2 open Actions/)).toBeVisible();
    await user.click(within(briefing).getByRole('button', { name: 'Brief me' }));

    expect(await screen.findByText(`Opened chat ${CHAT}`)).toBeInTheDocument();
    expect(bodies).toEqual([
      expect.objectContaining({ skill_id: 'growth_plan', mentions: [PRICING, BLOG] }),
    ]);
  });
});
