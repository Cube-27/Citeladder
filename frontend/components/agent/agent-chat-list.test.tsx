import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';

import { makeProject } from '@/test/fixtures/project';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

import { ChatSection } from './agent-chat-list';

const PROJECT = '11111111-1111-4111-8111-111111111111';

const CHAT = {
  id: '33333333-3333-4333-8333-333333333331',
  project_id: PROJECT,
  action_id: null,
  origin: 'chat',
  target_label: null,
  title: 'Why did citations drop',
  turn_count: 1,
  output_kind: null,
  last_activity_at: '2026-11-12T10:00:00Z',
  created_at: '2026-11-12T10:00:00Z',
  running: false,
};

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('ChatSection', () => {
  it('says the chats failed to load and retries the list read', async () => {
    let up = false;
    mswServer.use(
      http.get(`/api/v1/projects/${PROJECT}/agent/chats`, () =>
        up
          ? HttpResponse.json({ items: [CHAT], next_cursor: null })
          : // A failure the client does not retry on its own.
            HttpResponse.json({ detail: 'refused' }, { status: 400 }),
      ),
    );
    renderWithProviders(<ChatSection />, {
      projectSelection: {
        activeProjectId: PROJECT,
        activeProject: makeProject({ id: PROJECT }),
        status: 'ready',
      },
    });

    expect(await screen.findByText("Couldn't load chats.")).toBeVisible();
    up = true;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('link', { name: /Why did citations drop/u })).toBeVisible();
    expect(screen.queryByText("Couldn't load chats.")).toBeNull();
  });
});
