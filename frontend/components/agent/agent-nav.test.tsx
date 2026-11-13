import { screen, within } from '@testing-library/react';
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
import { focusByKeyboard } from '@/test/keyboard-focus';
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
  extra: Partial<{ origin: string; last_activity_at: string }> = {},
) {
  return {
    id,
    project_id: PROJECT,
    action_id: null,
    origin: 'chat',
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

it('tells chats with one title apart by where they started and when they last moved', async () => {
  serveChats([
    chat('33333333-3333-4333-8333-333333333331', 'Analyze the Site Health issues', false, {
      origin: 'site_health',
      last_activity_at: '2026-09-25T23:30:00Z',
    }),
    chat('33333333-3333-4333-8333-333333333332', 'Analyze the Site Health issues', false, {
      last_activity_at: '2026-09-24T09:30:00Z',
    }),
  ]);
  renderWithProviders(<AgentNav />, { projectSelection: { activeProjectId: PROJECT } });

  const rows = await screen.findAllByRole('link', { name: /Analyze the Site Health issues/ });
  expect(rows.map((row) => row.textContent)).toEqual([
    'Analyze the Site Health issuesSite Health · Sep 25',
    'Analyze the Site Health issuesChat · Sep 24',
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
  focusByKeyboard(row);
  expect((await screen.findByRole('tooltip')).textContent).toBe(
    'Analyze the Site Health issues on pricingChat · Sep 25',
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
  expect(within(running).getByRole('status', { name: 'Working' })).toBeVisible();
  expect(
    within(screen.getByRole('link', { name: /Plan the quarter/ })).getByRole('status', {
      name: 'Working',
    }),
  ).toBeVisible();
  expect(
    within(screen.getByRole('link', { name: /Earlier question/ })).queryByRole('status'),
  ).not.toBeInTheDocument();
});
