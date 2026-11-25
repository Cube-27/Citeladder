import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';

import type { BrandFactList } from '@citeladder/contracts/fact-checking';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

import { BrandFactsPanel } from './brand-facts-panel';

const projectId = '55555555-5555-4555-8555-555555555555';
const workspaceId = '66666666-6666-4666-8666-666666666666';
const factId = '77777777-7777-4777-8777-777777777777';

const list: BrandFactList = {
  enabled: true,
  facts: [
    {
      id: factId,
      topic: 'pricing',
      statement: 'Pro costs $59 per month.',
      source_url: null,
      status: 'confirmed',
      revision: 2,
      updated_at: '2026-10-10T00:00:00Z',
    },
  ],
  limits: { statement_max_chars: 300, facts_import_max_rows: 150 },
};

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('BrandFactsPanel', () => {
  it('keeps the edit dialog open with its changes when the save is refused', async () => {
    const user = userEvent.setup({ delay: null });
    mswServer.use(
      http.patch(`/api/v1/projects/${projectId}/brand-facts/${factId}`, () =>
        HttpResponse.json(
          { error: { message: 'This fact changed since it was loaded; reload and try again' } },
          { status: 409 },
        ),
      ),
      http.get(`/api/v1/projects/${projectId}/brand-facts`, () => HttpResponse.json(list)),
    );
    renderWithProviders(
      <BrandFactsPanel workspaceId={workspaceId} projectId={projectId} list={list} mayEdit />,
    );
    await user.click(screen.getByRole('button', { name: 'Edit fact' }));
    const source = screen.getByRole('textbox', { name: 'Source page' });
    await user.type(source, 'https://example.com/pricing');
    await user.click(screen.getByRole('button', { name: 'Save fact' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Source page' })).toHaveValue(
      'https://example.com/pricing',
    );
  });

  it('adds a fact as confirmed and closes the dialog, keeping it open when refused', async () => {
    const user = userEvent.setup({ delay: null });
    let refuse = true;
    const sent: unknown[] = [];
    mswServer.use(
      http.post(`/api/v1/projects/${projectId}/brand-facts`, async ({ request }) => {
        sent.push(await request.json());
        return refuse
          ? HttpResponse.json(
              { error: { message: 'Brand facts are limited to 50 per project' } },
              { status: 422 },
            )
          : HttpResponse.json({ ...list.facts[0], status: 'confirmed' }, { status: 201 });
      }),
      http.get(`/api/v1/projects/${projectId}/brand-facts`, () => HttpResponse.json(list)),
    );
    renderWithProviders(
      <BrandFactsPanel workspaceId={workspaceId} projectId={projectId} list={list} mayEdit />,
    );
    await user.click(screen.getByRole('button', { name: 'Add fact' }));
    const fact = screen.getByRole('textbox', { name: 'Fact' });
    await user.type(fact, 'Pro costs $49 per month.');
    await user.click(screen.getByRole('button', { name: 'Save fact' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(fact).toHaveValue('Pro costs $49 per month.');

    refuse = false;
    await user.click(screen.getByRole('button', { name: 'Save fact' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sent.at(-1)).toEqual({
      topic: 'pricing',
      statement: 'Pro costs $49 per month.',
      source_url: null,
      status: 'confirmed',
    });
  });
});
