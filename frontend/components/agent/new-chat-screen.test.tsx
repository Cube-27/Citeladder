import { screen } from '@testing-library/react';
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

function baseHandlers() {
  return [
    http.get('/api/v1/agent/skills', () => HttpResponse.json({ skills: [] })),
    http.get(`/api/v1/projects/${PROJECT}/actions`, () =>
      HttpResponse.json({ items: [], next_cursor: null, status_counts: {} }),
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
        return HttpResponse.json(
          {
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
          },
          { status: 202 },
        );
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

  it('explains a plan without the agent instead of offering to send', async () => {
    entitlement.agent = false;
    mswServer.use(...baseHandlers());
    renderNewChat('');

    expect(await screen.findByText(/plan does not include the agent/i)).toBeVisible();
    expect(screen.getByLabelText('Message the agent')).toBeDisabled();
  });
});
