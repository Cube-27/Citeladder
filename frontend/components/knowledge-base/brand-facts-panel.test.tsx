import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';

import type { BrandFactList } from '@citeladder/contracts/fact-checking';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';
import { ToastProvider } from '@/components/ui/toast';

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
  it('retires a fact after "Retire fact?" and Undo restores it with its status and text', async () => {
    const user = userEvent.setup({ delay: null });
    const sent: unknown[] = [];
    mswServer.use(
      http.patch(`/api/v1/projects/${projectId}/brand-facts/${factId}`, async ({ request }) => {
        sent.push(['PATCH', await request.json()]);
        return HttpResponse.json({ ...list.facts[0], status: 'retired', revision: 3 });
      }),
      http.post(`/api/v1/projects/${projectId}/brand-facts`, async ({ request }) => {
        sent.push(['POST', await request.json()]);
        return HttpResponse.json({ ...list.facts[0], revision: 1 }, { status: 201 });
      }),
      http.get(`/api/v1/projects/${projectId}/brand-facts`, () => HttpResponse.json(list)),
    );
    renderWithProviders(
      <ToastProvider>
        <BrandFactsPanel workspaceId={workspaceId} projectId={projectId} list={list} mayEdit />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Retire fact' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Retire fact?' });
    await user.click(within(dialog).getByRole('button', { name: 'Retire fact' }));
    await screen.findByText('Fact retired');
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    await vi.waitFor(() =>
      expect(sent).toEqual([
        ['PATCH', { expected_revision: 2, status: 'retired' }],
        [
          'POST',
          {
            topic: 'pricing',
            statement: 'Pro costs $59 per month.',
            source_url: null,
            status: 'confirmed',
          },
        ],
      ]),
    );
  });

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
