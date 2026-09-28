import { http, HttpResponse } from 'msw';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';

import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';
import { makeProject } from '@/test/fixtures/project';
import { InternalLinksPanel } from './internal-links-panel';

const project = makeProject();
const run = '00000000-0000-4000-8000-000000000011';
const crawl = '00000000-0000-4000-8000-000000000012';
const endpoint = `/api/v1/projects/${project.id}/site-health/internal-links`;
const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

function page(index: number, title: string) {
  const id = uuid(100 + index);
  return {
    analysis_id: id,
    artifact_id: id,
    site_url_id: id,
    url: `https://example.test/page-${index}`,
    title,
    h1: title,
    description: `${title} description.`,
    excerpt: '',
    page_kind: 'category',
    contextual_inbound: 2,
    links_complete: true,
    eligible_target: true,
    extractor_version: '1',
  };
}
function analysis(overrides: Record<string, unknown> = {}) {
  return {
    id: run,
    crawl_id: crawl,
    created_at: '2026-09-28T10:00:00Z',
    state: 'completed',
    page_count: 20,
    omitted_pages: 0,
    stale: false,
    recommendations: [],
    diagnostics: {
      candidates: 30,
      completed: 30,
      pending: 0,
      unavailable: 0,
      below_threshold: 30,
      reasons: {},
      elapsed_seconds: 12,
    },
    ...overrides,
  };
}
const read = (value: unknown) => ({
  history: [],
  crawl_id: crawl,
  availability: 'ready',
  analysis: value,
});
function renderPanel() {
  return renderWithProviders(
    <InternalLinksPanel projectId={project.id} workspaceId={project.workspace_id} />,
    {
      initialEntries: [`/site?tab=internal-links&project=${project.id}`],
      projectSelection: { activeProject: project, activeProjectId: project.id, status: 'ready' },
    },
  );
}
beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('Internal links', () => {
  it('runs only on request and reports unavailable checks instead of an empty result', async () => {
    const failed = analysis({
      state: 'unavailable',
      diagnostics: {
        ...analysis().diagnostics,
        completed: 0,
        below_threshold: 0,
        unavailable: 30,
        reasons: { funding_unavailable: 30 },
      },
    });
    let analyzed = false;
    mswServer.use(
      http.get(endpoint, () => HttpResponse.json(read(analyzed ? failed : null))),
      http.post(`${endpoint}/analyses`, () => {
        analyzed = true;
        return HttpResponse.json(read(failed));
      }),
    );
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Analyze internal links' }));
    expect(await screen.findByText(/insufficient AI credits \(30\)/)).toBeInTheDocument();
    expect(screen.queryByText(/none needed a new link/)).not.toBeInTheDocument();
  });

  it('tells "nothing to compare" apart from "checked and nothing qualified"', async () => {
    mswServer.use(http.get(endpoint, () => HttpResponse.json(read(analysis()))));
    renderPanel();
    expect(
      await screen.findByText('30 page pairs were checked and none needed a new link.'),
    ).toBeInTheDocument();
  });

  it('pages suggestions with rows per page and opens the review drawer', async () => {
    const links = Array.from({ length: 12 }, (_, index) => ({
      id: uuid(200 + index),
      source: page(index, `Source ${index}`),
      target: page(50 + index, `Destination ${index}`),
      anchor: `Anchor ${index}`,
      usefulness: 0.9 - index / 100,
      action_id: null,
      action_status: null,
    }));
    mswServer.use(
      http.get(endpoint, () => HttpResponse.json(read(analysis({ recommendations: links })))),
    );
    renderPanel();
    expect(await screen.findByText('Anchor 0')).toBeInTheDocument();
    expect(screen.queryByText('Anchor 11')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Anchor 11')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Review link from Source 11 to Destination 11' }),
    );
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('Anchor 11')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /Copy HTML/ })).toBeInTheDocument();
  });
});
