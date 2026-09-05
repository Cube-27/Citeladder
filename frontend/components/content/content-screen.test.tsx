import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';

import { ProjectProvider } from '@/lib/project/project-context';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

import { ContentScreen } from './content-screen';
import { contentSkillCatalogFixture as skillCatalog } from './content-screen.test-fixtures';

const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT = '11111111-1111-4111-8111-111111111111';
const GENERATION = '33333333-3333-4333-8333-333333333333';

const project = {
  id: PROJECT,
  workspace_id: WORKSPACE,
  name: 'Acme',
  brand_name: 'Acme',
  website_url: 'https://acme.test',
  country_code: 'US',
  language_code: 'en',
  industry: 'Software',
  subindustry: 'Analytics',
  primary_market: 'US',
  benchmark_mode: 'consumer_like',
  default_repetitions: 3,
  brand: { aliases: [] },
  owned_domains: [],
  unintended_domains: [],
  competitors: [],
  prompt_sets: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function generation(overrides: Record<string, unknown> = {}) {
  return {
    id: GENERATION,
    project_id: PROJECT,
    status: 'queued',
    skill_id: 'content_page',
    opportunity_id: null,
    skill_version: 1,
    feedback: null,
    feedback_reason: '',
    feedback_at: null,
    context_status: 'included',
    requested_model: 'mistral-small-latest',
    returned_model: null,
    provider: 'mistral',
    created_at: '2026-07-15T00:00:00Z',
    updated_at: '2026-07-15T00:00:00Z',
    completed_at: null,
    error_code: '',
    instruction_preview: 'Write a landing page',
    user_instruction: 'Write a landing page',
    context_summary: {
      version: 'content-context-v1',
      crawl_page_count: 3,
      crawl_urls: ['https://acme.test/', 'https://acme.test/pricing'],
      crawl_completed_at: '2026-07-15T00:00:00Z',
      brand_memory: true,
      brand_fields: ['description'],
      target_url: null,
      issue_count: 0,
      related_page_count: 3,
      omissions: [],
    },
    finish_reason: null,
    output_truncated: false,
    output_text: null,
    usage: null,
    latency_ms: null,
    error_detail: '',
    generator_version: 'content-v3',
    ...overrides,
  };
}

const succeededGeneration = generation({
  status: 'succeeded',
  returned_model: 'mistral-small-2506',
  finish_reason: 'stop',
  output_text: '# About Acme\n\nWe make things.',
  usage: { total_tokens: 30 },
  latency_ms: 420,
  completed_at: '2026-07-15T00:01:00Z',
});

function mockBase(listItems: Record<string, unknown>[] = []) {
  mswServer.use(
    http.get('/api/v1/projects', () => HttpResponse.json([project])),
    // ProjectProvider warms these shared navigation queries for every active
    // project, so the composer fixture must own them even though this screen
    // does not render either response.
    http.get('/api/v1/audits', () => HttpResponse.json([])),
    http.get(`/api/v1/projects/${PROJECT}/site-health`, () =>
      HttpResponse.json({
        project_id: PROJECT,
        crawl: null,
        score_summary: null,
        phase: 'empty',
        snapshot_id: null,
        quota: { used: 0, limit: 50 },
        root_errors: [],
      }),
    ),
    http.get('/api/v1/content/skills', () => HttpResponse.json(skillCatalog)),
    http.get('/api/v1/content/context-preview', () =>
      HttpResponse.json({
        brand_memory: true,
        target_page: null,
        issue_count: 0,
        related_page_count: 3,
      }),
    ),
    http.get('/api/v1/content/target-pages', () => HttpResponse.json([])),
    http.get('/api/v1/content/generations', () => HttpResponse.json(listItems)),
    http.post(`/api/v1/projects/${PROJECT}/logos/refresh`, () => HttpResponse.json({})),
  );
}

function renderScreen() {
  return renderWithProviders(
    <ProjectProvider>
      <ContentScreen />
    </ProjectProvider>,
  );
}

async function submitInstruction(instruction = 'Write a landing page') {
  await userEvent.type(
    await screen.findByRole('textbox', { name: 'Your instruction' }),
    instruction,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
}

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  mswServer.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => mswServer.close());

describe('ContentScreen clean composer', () => {
  it('defaults to the catalog skill and sends the channel skill the user selects', async () => {
    const sent: Record<string, unknown>[] = [];
    mockBase();
    mswServer.use(
      http.post('/api/v1/content/generations', async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(generation(), { status: 201 });
      }),
      http.get(`/api/v1/content/generations/${GENERATION}`, () => HttpResponse.json(generation())),
    );
    renderScreen();
    await screen.findByRole('button', { name: 'Web: Website content page' });
    await userEvent.click(screen.getByRole('button', { name: 'Social formats' }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: /LinkedIn post/i }));
    await submitInstruction('Announce the new pricing');
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      project_id: PROJECT,
      skill_id: 'linkedin',
      user_instruction: 'Announce the new pricing',
    });
  });

  it('keeps generation history in a drawer and selects a previous generation', async () => {
    mockBase([generation({ status: 'succeeded' })]);
    mswServer.use(
      http.get(`/api/v1/content/generations/${GENERATION}`, () =>
        HttpResponse.json(succeededGeneration),
      ),
    );
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'History' }));
    const drawer = await screen.findByRole('dialog', { name: 'Generation history' });
    await userEvent.click(within(drawer).getByText('Write a landing page'));
    expect(await screen.findByRole('heading', { level: 1, name: 'About Acme' })).toBeVisible();
  });

  it('disables Generate for an empty instruction and names canonical context', async () => {
    mockBase();
    renderScreen();
    expect(await screen.findByRole('button', { name: 'Generate' })).toBeDisabled();
    expect(await screen.findByText('Context: Brand memory · 3 related pages')).toBeVisible();
    await userEvent.type(screen.getByRole('textbox', { name: 'Your instruction' }), 'Write it');
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled();
  });

  it('searches persisted target pages and sends the selected page id', async () => {
    const targetId = '44444444-4444-4444-8444-444444444444';
    const searchTerms: string[] = [];
    const sent: Record<string, unknown>[] = [];
    mockBase();
    mswServer.use(
      http.get('/api/v1/content/target-pages', ({ request }) => {
        searchTerms.push(new URL(request.url).searchParams.get('query') ?? '');
        return HttpResponse.json([
          {
            site_url_id: targetId,
            title: 'Pricing',
            url: 'https://acme.test/pricing',
            display_url: 'acme.test/pricing',
            page_kind: 'product',
          },
        ]);
      }),
      http.post('/api/v1/content/generations', async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(generation(), { status: 201 });
      }),
      http.get(`/api/v1/content/generations/${GENERATION}`, () => HttpResponse.json(generation())),
    );
    renderScreen();
    const target = await screen.findByRole('combobox', { name: 'Target page' });
    await userEvent.click(target);
    await userEvent.type(target, 'pricing');
    await userEvent.click(await screen.findByRole('option', { name: /pricing/i }));
    await submitInstruction('Rewrite the plans for buyers');

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(searchTerms).toContain('pricing');
    expect(sent[0]).toMatchObject({ target_site_url_id: targetId });
  });

  it('shows the no-project state', async () => {
    mswServer.use(http.get('/api/v1/projects', () => HttpResponse.json([])));
    renderScreen();
    expect(await screen.findByRole('link', { name: /go to projects/i })).toHaveAttribute(
      'href',
      '/projects',
    );
    expect(screen.queryByRole('button', { name: 'Generate' })).not.toBeInTheDocument();
  });

  it('deletes a terminal history item without making active work deletable', async () => {
    const activeId = '55555555-5555-4555-8555-555555555555';
    let deleted = '';
    mockBase([
      generation({ status: 'succeeded' }),
      generation({ id: activeId, status: 'running', instruction_preview: 'Still working' }),
    ]);
    mswServer.use(
      http.delete(`/api/v1/content/generations/${GENERATION}`, () => {
        deleted = GENERATION;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'History' }));
    const drawer = await screen.findByRole('dialog', { name: 'Generation history' });
    await userEvent.click(
      within(drawer).getByRole('button', { name: /delete write a landing page/i }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Delete generation?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete generation' }));
    await waitFor(() => expect(deleted).toBe(GENERATION));
    expect(within(drawer).queryByRole('button', { name: /delete still working/i })).toBeNull();
  });

  it('confirms clearing history and keeps active drafts out of the destructive action', async () => {
    let cleared = false;
    mockBase([
      generation({ status: 'succeeded' }),
      generation({ id: '55555555-5555-4555-8555-555555555555' }),
    ]);
    mswServer.use(
      http.delete('/api/v1/content/generations', () => {
        cleared = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'History' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear history' }));
    const dialog = await screen.findByRole('dialog', { name: 'Clear generation history?' });
    expect(dialog).toHaveTextContent(/active drafts stay available/i);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Clear history' }));
    await waitFor(() => expect(cleared).toBe(true));
  });
});

describe('ContentScreen generation lifecycle', () => {
  it('enqueues, shows active work, then renders the result and persisted provenance', async () => {
    let detailCalls = 0;
    mockBase();
    mswServer.use(
      http.post('/api/v1/content/generations', () =>
        HttpResponse.json(generation(), { status: 201 }),
      ),
      http.get(`/api/v1/content/generations/${GENERATION}`, () => {
        detailCalls += 1;
        return HttpResponse.json(detailCalls < 2 ? generation() : succeededGeneration);
      }),
    );
    renderScreen();
    await submitInstruction();
    expect(await screen.findByRole('status', { name: /generating content/i })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Your instruction' })).toBeDisabled();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'About Acme' }, { timeout: 5000 }),
    ).toBeVisible();
    expect(screen.getByText(/website crawl · 3 pages/i)).toBeVisible();
  });

  it('renders the truncation warning', async () => {
    mockBase();
    mswServer.use(
      http.post('/api/v1/content/generations', () =>
        HttpResponse.json(generation(), { status: 201 }),
      ),
      http.get(`/api/v1/content/generations/${GENERATION}`, () =>
        HttpResponse.json({
          ...succeededGeneration,
          output_truncated: true,
          finish_reason: 'length',
        }),
      ),
    );
    renderScreen();
    await submitInstruction('Write a long page');
    expect(await screen.findByText(/hit the length limit/i)).toBeVisible();
  });

  it('copies raw Markdown rather than rendered text', async () => {
    mockBase();
    mswServer.use(
      http.post('/api/v1/content/generations', () =>
        HttpResponse.json(generation(), { status: 201 }),
      ),
      http.get(`/api/v1/content/generations/${GENERATION}`, () =>
        HttpResponse.json(succeededGeneration),
      ),
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderScreen();
    await submitInstruction();
    await userEvent.click((await screen.findAllByRole('button', { name: /copy/i }))[0]);
    expect(writeText).toHaveBeenCalledWith('# About Acme\n\nWe make things.');
  });

  it('cancels active work through the cancel endpoint', async () => {
    let cancelled = false;
    mockBase();
    mswServer.use(
      http.post('/api/v1/content/generations', () =>
        HttpResponse.json(generation(), { status: 201 }),
      ),
      http.get(`/api/v1/content/generations/${GENERATION}`, () =>
        HttpResponse.json(cancelled ? generation({ status: 'cancelled' }) : generation()),
      ),
      http.post(`/api/v1/content/generations/${GENERATION}/cancel`, () => {
        cancelled = true;
        return HttpResponse.json(generation({ status: 'cancelled' }));
      }),
    );
    renderScreen();
    await submitInstruction();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(cancelled).toBe(true));
    await waitFor(() =>
      expect(screen.queryByRole('status', { name: /generating/i })).not.toBeInTheDocument(),
    );
  });
});

describe('ContentScreen failures', () => {
  it('explains missing provider configuration and preserves the instruction on dismiss', async () => {
    mockBase();
    mswServer.use(
      http.post('/api/v1/content/generations', () =>
        HttpResponse.json({ detail: 'provider_not_configured' }, { status: 409 }),
      ),
    );
    renderScreen();
    await submitInstruction('Keep this instruction');
    expect(await screen.findByRole('alert')).toHaveTextContent(/not configured/i);
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.getByRole('textbox', { name: 'Your instruction' })).toHaveValue(
      'Keep this instruction',
    );
  });

  it('truthfully labels a result with unavailable context', async () => {
    mockBase();
    mswServer.use(
      http.post('/api/v1/content/generations', () =>
        HttpResponse.json(
          generation({
            status: 'succeeded',
            context_status: 'unavailable',
            context_summary: {
              version: 'content-context-v1',
              crawl_page_count: 0,
              crawl_urls: [],
              crawl_completed_at: null,
              brand_memory: false,
              brand_fields: [],
              target_url: null,
              issue_count: 0,
              related_page_count: 0,
              omissions: [],
            },
            output_text: 'Draft',
          }),
          { status: 202 },
        ),
      ),
    );
    renderScreen();
    await submitInstruction();
    expect(await screen.findByText(/Context used: user instruction only/i)).toBeVisible();
  });

  it('offers Try again for a failed generation', async () => {
    const retryId = '55555555-5555-4555-8555-555555555555';
    let retried = false;
    mockBase();
    mswServer.use(
      http.post('/api/v1/content/generations', () =>
        HttpResponse.json(generation(), { status: 201 }),
      ),
      http.get(`/api/v1/content/generations/${GENERATION}`, () =>
        HttpResponse.json(generation({ status: 'failed', error_code: 'auth_failure' })),
      ),
      http.post(`/api/v1/content/generations/${GENERATION}/try-again`, () => {
        retried = true;
        return HttpResponse.json(generation({ id: retryId }), { status: 201 });
      }),
      http.get(`/api/v1/content/generations/${retryId}`, () =>
        HttpResponse.json(generation({ id: retryId })),
      ),
    );
    renderScreen();
    await submitInstruction();
    expect(await screen.findByRole('alert')).toHaveTextContent(/generation failed/i);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(retried).toBe(true));
  });
});
