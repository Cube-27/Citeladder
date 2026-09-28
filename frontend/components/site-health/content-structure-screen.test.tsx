import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';

import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';
import { makeProject } from '@/test/fixtures/project';
import { ContentStructureScreen } from './content-structure-screen';

const project = makeProject();
const run = '00000000-0000-4000-8000-000000000011';
const crawl = '00000000-0000-4000-8000-000000000012';
const source = '00000000-0000-4000-8000-000000000013';
const target = '00000000-0000-4000-8000-000000000014';
const recommendation = '00000000-0000-4000-8000-000000000015';
const endpoint = `/api/v1/projects/${project.id}/site-health/content-structure`;
function page(id: string, title: string) {
  return {
    analysis_id: id,
    artifact_id: id,
    site_url_id: id,
    url: `https://example.test/${id}`,
    title,
    excerpt: 'Garden soil supports healthy plants.',
    headings: [],
    contextual_targets: [],
    navigation_targets: [],
    links_complete: true,
    eligible_target: true,
    extractor_version: '1',
  };
}
function renderScreen() {
  return renderWithProviders(<ContentStructureScreen />, {
    initialEntries: [`/site/content-structure?project=${project.id}`],
    projectSelection: { activeProject: project, activeProjectId: project.id, status: 'ready' },
  });
}
beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('Content structure', () => {
  it('requires explicit analysis and renders unavailability without empty results', async () => {
    const saved = {
      crawl_id: crawl,
      availability: 'ready',
      analysis: {
        id: run,
        crawl_id: crawl,
        created_at: '2026-09-28T10:00:00Z',
        state: 'unavailable',
        page_count: 2,
        omitted_pages: 0,
        omitted_candidates: 0,
        unassigned_pages: 2,
        unavailable_judgments: 1,
        stale: false,
        recommendations: [],
        topics: [],
        pages: [],
      },
    };
    let analyzed = false;
    mswServer.use(
      http.get(endpoint, () =>
        HttpResponse.json(
          analyzed ? saved : { analysis: null, crawl_id: crawl, availability: 'ready' },
        ),
      ),
      http.post(`${endpoint}/analyses`, () => {
        analyzed = true;
        return HttpResponse.json(saved);
      }),
    );
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'Analyze content' }));
    expect(await screen.findByRole('heading', { name: 'Analysis failed' })).toBeInTheDocument();
    expect(screen.queryByText('No link suggestions to review')).not.toBeInTheDocument();
  });

  it('opens exact passage evidence and returns keyboard focus to the review button', async () => {
    mswServer.use(
      http.get(endpoint, () =>
        HttpResponse.json({
          crawl_id: crawl,
          availability: 'ready',
          analysis: {
            id: run,
            crawl_id: crawl,
            created_at: '2026-09-28T10:00:00Z',
            state: 'completed',
            page_count: 2,
            omitted_pages: 0,
            omitted_candidates: 0,
            unassigned_pages: 2,
            unavailable_judgments: 0,
            stale: false,
            recommendations: [
              {
                id: recommendation,
                source: page(source, 'Plant care'),
                target: page(target, 'Soil guide'),
                passage: {
                  locator: '/main/p',
                  heading: 'Getting started',
                  text: 'Choose healthy garden soil for your plants.',
                  linked_ranges: [],
                },
                anchor: { text: 'healthy garden soil', start: 7, end: 26 },
                usefulness: 0.94,
                anchor_confidence: 0.82,
                action_id: null,
                action_status: null,
              },
            ],
            topics: [],
            pages: [],
          },
        }),
      ),
    );
    renderScreen();
    const button = await screen.findByRole('button', {
      name: 'Review link from Plant care to Soil guide',
    });
    await userEvent.click(button);
    expect(await screen.findByRole('dialog', { name: 'Review internal link' })).toBeInTheDocument();
    expect(screen.getByText('healthy garden soil', { selector: 'mark' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(button).toHaveFocus();
  });
});
