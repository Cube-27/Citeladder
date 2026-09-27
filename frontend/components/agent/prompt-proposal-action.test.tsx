import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vite-plus/test';

import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';
import { PromptProposalAction, promptPortfolioReport } from './prompt-proposal-action';

vi.mock('@/lib/prompts/use-prompt-set', () => ({
  usePromptSet: () => ({ ensurePromptSet: async () => ({ id: 'set' }) }),
}));
beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

it('keeps the readable proposal while hiding submission metadata', () => {
  expect(promptPortfolioReport('Buyer questions\n\n```json\n{"prompts":[]}\n```')).toBe(
    'Buyer questions\n\n',
  );
  const broken = '```json\nnot valid JSON\n```';
  expect(promptPortfolioReport(broken)).toBe(broken);
});

it('submits only a saved revision on click and keeps an empty result recoverable', async () => {
  let submitted: unknown;
  mswServer.use(
    http.post('/api/v1/prompt-sets/set/generate', async ({ request }) => {
      submitted = await request.json();
      return HttpResponse.json({
        candidates: [],
        topics: [],
        requested_count: 100,
        dropped_duplicates: 0,
        candidates_generated: 0,
        quality_gate: 'off',
        quality_rejected: 0,
      });
    }),
  );
  renderWithProviders(
    <PromptProposalAction workspaceId="workspace" revisionId="revision" disabled={false} />,
  );
  expect(submitted).toBeUndefined();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Review in Prompts' }));
  await waitFor(() => expect(submitted).toEqual({ agent_revision_id: 'revision' }));
  expect(await screen.findByText(/No new questions passed admission/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Review in Prompts' })).toBeEnabled();
});
