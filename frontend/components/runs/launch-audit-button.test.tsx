import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';

import { makeProject } from '@/test/fixtures/project';
import { makePrompt, makeSet, makeSetList } from '@/test/fixtures/prompts';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

import { LaunchAuditButton } from './launch-audit-button';

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

function renderWithSets(sets: Parameters<typeof makeSetList>[0]) {
  mswServer.use(http.get('/api/v1/prompt-sets', () => HttpResponse.json(makeSetList(sets))));
  const project = makeProject();
  return renderWithProviders(<LaunchAuditButton />, {
    projectSelection: {
      projects: [project],
      activeProject: project,
      activeProjectId: project.id,
      status: 'ready',
    },
  });
}

describe('LaunchAuditButton', () => {
  it('waits for an active prompt on every page and says why', async () => {
    renderWithSets([makeSet([makePrompt({ status: 'archived' })])]);

    const button = await screen.findByRole('button', {
      name: 'Launch run',
      description: 'Add an active prompt to launch a run.',
    });
    expect(button).toBeDisabled();
  });

  it('launches once a set holds an active prompt', async () => {
    renderWithSets([makeSet([makePrompt()])]);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Launch run' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Launch run' })).not.toHaveAccessibleDescription();
  });
});
