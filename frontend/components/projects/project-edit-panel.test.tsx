import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Project } from '@/lib/api/types';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

import { ProjectEditPanel } from './project-edit-panel';

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

const project = {
  id: PROJECT_ID,
  workspace_id: '22222222-2222-4222-8222-222222222222',
  name: 'Acme',
  brand_name: 'Acme',
  website_url: 'https://acme.com',
  country_code: 'US',
  language_code: 'en',
  benchmark_mode: 'consumer_like',
  default_repetitions: 3,
  brand: { aliases: ['Acme Inc'] },
  owned_domains: ['acme.com'],
  unintended_domains: [],
  competitors: [{ name: 'Globex', aliases: ['Globex Corp'], domains: ['globex.com'] }],
  prompt_sets: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
} as unknown as Project;

describe('ProjectEditPanel', () => {
  it('sends the edited fields and preserves competitor aliases it does not edit', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> | undefined;
    mswServer.use(
      http.patch(`/api/v1/projects/${PROJECT_ID}`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...project, ...body });
      }),
    );

    renderWithProviders(<ProjectEditPanel project={project} open onOpenChange={vi.fn()} />);

    const aliases = screen.getByLabelText('Brand aliases');
    await user.clear(aliases);
    await user.type(aliases, 'Acme Inc, Acme Co');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body?.brand).toEqual({ aliases: ['Acme Inc', 'Acme Co'] });
    // The panel does not edit per-competitor aliases, so it must send back what
    // the project already had rather than clearing them on every save.
    expect(body?.competitors).toEqual([
      { name: 'Globex', aliases: ['Globex Corp'], domains: ['globex.com'] },
    ]);
  });

  it('drops blank entries from the comma-separated lists', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> | undefined;
    mswServer.use(
      http.patch(`/api/v1/projects/${PROJECT_ID}`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...project, ...body });
      }),
    );

    renderWithProviders(<ProjectEditPanel project={project} open onOpenChange={vi.fn()} />);

    const owned = screen.getByLabelText('Owned');
    await user.clear(owned);
    await user.type(owned, 'acme.com, , shop.acme.com,');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body?.owned_domains).toEqual(['acme.com', 'shop.acme.com']);
  });
});
