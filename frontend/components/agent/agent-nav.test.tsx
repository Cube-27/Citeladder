import { act, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vite-plus/test';

import { DISPLAY_TIME_ZONE_COOKIE } from '@/lib/display-timezone';
import { NOW, PROJECT, skills } from '@/test/agent-chat-fixture';
import { actionsPage } from '@/test/fixtures/actions';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

import { AgentNav } from './agent-nav';

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

function chat(
  id: string,
  title: string,
  running: boolean,
  extra: Partial<{ target_label: string; last_activity_at: string }> = {},
) {
  return {
    id,
    project_id: PROJECT,
    action_id: null,
    target_label: null,
    title,
    turn_count: 1,
    output_kind: null,
    last_activity_at: NOW,
    created_at: NOW,
    running,
    ...extra,
  };
}

function serveChats(items: ReturnType<typeof chat>[]) {
  mswServer.use(
    http.get('/api/v1/agent/skills', () => HttpResponse.json(skills)),
    http.get(`/api/v1/projects/${PROJECT}/actions`, () => HttpResponse.json(actionsPage())),
    http.get(`/api/v1/projects/${PROJECT}/agent/chats`, () =>
      HttpResponse.json({ items, next_cursor: null }),
    ),
  );
}

beforeEach(() => {
  // Times read in one zone whatever machine runs the test.
  document.cookie = `${DISPLAY_TIME_ZONE_COOKIE}=UTC; Path=/`;
});
afterEach(() => {
  document.cookie = `${DISPLAY_TIME_ZONE_COOKIE}=; Max-Age=0; Path=/`;
});

it('tells chats with one title apart by their second line', async () => {
  serveChats([
    chat('33333333-3333-4333-8333-333333333331', 'Analyze the Site Health issues', false, {
      last_activity_at: '2026-09-25T14:05:00Z',
    }),
    chat('33333333-3333-4333-8333-333333333332', 'Analyze the Site Health issues', false, {
      target_label: 'example.com/pricing',
      last_activity_at: '2026-09-24T09:30:00Z',
    }),
  ]);
  renderWithProviders(<AgentNav />, { projectSelection: { activeProjectId: PROJECT } });

  const rows = await screen.findAllByRole('link', { name: /Analyze the Site Health issues/ });
  // Intl may join the time and its AM/PM with a narrow no-break space.
  expect(rows.map((row) => row.textContent?.replace(/\s/g, ' '))).toEqual([
    'Analyze the Site Health issuesSep 25, 2:05 PM',
    'Analyze the Site Health issuesexample.com/pricing · Sep 24, 9:30 AM',
  ]);
});

it('shows a cut chat title in full on keyboard focus', async () => {
  // jsdom lays nothing out; report every line as wider than the sidebar.
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(1000);
  onTestFinished(() => {
    vi.restoreAllMocks();
  });
  serveChats([
    chat(
      '33333333-3333-4333-8333-333333333331',
      'Analyze the Site Health issues on pricing',
      false,
    ),
  ]);
  renderWithProviders(<AgentNav />, { projectSelection: { activeProjectId: PROJECT } });

  const row = await screen.findByRole('link', { name: /Analyze the Site Health issues/ });
  act(() => row.focus());
  expect(await screen.findByRole('tooltip')).toHaveTextContent(
    'Analyze the Site Health issues on pricingSep 25, 10:00 AM',
  );
});

it('marks every chat whose turn is still running', async () => {
  serveChats([
    chat('33333333-3333-4333-8333-333333333331', 'Fix mixed content', true),
    chat('33333333-3333-4333-8333-333333333332', 'Plan the quarter', true),
    chat('33333333-3333-4333-8333-333333333333', 'Earlier question', false),
  ]);
  renderWithProviders(<AgentNav />, { projectSelection: { activeProjectId: PROJECT } });

  const running = await screen.findByRole('link', { name: /Fix mixed content/ });
  expect(within(running).getByText('Working…')).toBeVisible();
  expect(
    within(screen.getByRole('link', { name: /Plan the quarter/ })).getByText('Working…'),
  ).toBeVisible();
  expect(
    within(screen.getByRole('link', { name: /Earlier question/ })).queryByText('Working…'),
  ).not.toBeInTheDocument();
});
