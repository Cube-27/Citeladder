import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';

import type { SiteIssue } from '@citeladder/contracts';
import { issue } from '@/components/site-health/issues-catalog.test-support';
import { actionItem, actionsPage } from '@/test/fixtures/actions';
import { makeProject } from '@/test/fixtures/project';
import { makeSiteCrawl } from '@/test/fixtures/site-health';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';

import { ActionsScreen } from './actions-screen';

const WORKSPACE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT = '11111111-1111-4111-8111-111111111111';
const CRAWL = '22222222-2222-4222-8222-222222222222';
const PROMPT_ACTION = '33333333-3333-4333-8333-333333333331';
const PAGE_ACTION = '33333333-3333-4333-8333-333333333332';
const MEASURED = '33333333-3333-4333-8333-333333333334';
const ROBOTS = 'bbbbbbbb-1111-4111-8111-111111111111';
const TITLES = 'bbbbbbbb-2222-4222-8222-222222222222';
const SCHEMA = 'bbbbbbbb-3333-4333-8333-333333333333';

const selection = {
  activeProjectId: PROJECT,
  activeProject: makeProject({ id: PROJECT, workspace_id: WORKSPACE }),
  status: 'ready' as const,
};

/** The latest crawl's defects per Issues tab: one each, the technical one critical and site-wide. */
const ISSUES: Record<string, SiteIssue[]> = {
  technical: [
    issue({
      group_id: ROBOTS,
      crawl_id: CRAWL,
      rule_id: 'technical.sitewide_broken_link',
      dimension: 'technical',
      category: 'indexability',
      severity: 'critical',
      title: 'Broken links in the site navigation',
      affected_url_count: 1,
    }),
  ],
  content: [
    issue({
      group_id: TITLES,
      crawl_id: CRAWL,
      rule_id: 'web.title_missing',
      dimension: 'technical',
      category: 'metadata',
      severity: 'medium',
      title: 'Pages without a title',
      affected_url_count: 14,
    }),
  ],
  aeo: [issue({ group_id: SCHEMA, crawl_id: CRAWL, severity: 'low', affected_url_count: 32 })],
};

const prompt = {
  ...actionItem(PROMPT_ACTION, 'best organic baby bodysuits', PROJECT),
  target_kind: 'prompt',
  approach: 'create_new',
  priority_band: 'high',
  priority_score: 90,
  families: ['ai_visibility'],
};
const page = {
  ...actionItem(PAGE_ACTION, 'https://acme.test/Categories/Baby/Bodysuits/SCE2001', PROJECT),
  target_url: 'https://acme.test/Categories/Baby/Bodysuits/SCE2001',
  approach: 'improve_existing',
  priority_band: 'medium',
  priority_score: 50,
  families: ['search_console'],
  member_count: 2,
};
const measured = {
  ...actionItem(MEASURED, 'https://acme.test/pricing', PROJECT),
  status: 'measuring',
};

/**
 * The project as the API answers each read: the crawl, its Issues tabs and fix
 * progress, no catalog, and Actions by status. Every Actions read is recorded
 * as its query string.
 */
function serve(reads: string[]) {
  mswServer.use(
    http.get(`/api/v1/projects/${PROJECT}/site-health`, () =>
      HttpResponse.json({
        project_id: PROJECT,
        crawl: makeSiteCrawl({ id: CRAWL, workspace_id: WORKSPACE, project_id: PROJECT }),
        score_summary: null,
        phase: 'dashboard',
        snapshot_id: null,
        quota: { used: 1, limit: 50 },
        root_errors: [],
      }),
    ),
    http.get(`/api/v1/site-crawls/${CRAWL}/issues`, ({ request }) => {
      const section = new URL(request.url).searchParams.get('section') ?? '';
      return HttpResponse.json({
        items: ISSUES[section] ?? [],
        next_cursor: null,
        summary: {
          issue_count: 3,
          defect_issue_type_count: 3,
          advisory_issue_type_count: 0,
          occurrence_count: 47,
          severity_counts: { critical: 1, medium: 1, low: 1 },
          dimension_counts: { technical: 2, aeo: 1 },
          affected_url_count: 47,
          monitored_affected_url_count: 47,
          section_counts: { technical: 1, content: 1, aeo: 1 },
        },
      });
    }),
    http.get(`/api/v1/site-crawls/${CRAWL}/issue-fixes`, () =>
      HttpResponse.json({
        crawl_id: CRAWL,
        items: [
          {
            group_id: SCHEMA,
            affected_url_count: 32,
            fixed_url_count: 3,
            verified_url_count: 1,
            rerun_url_count: 29,
          },
        ],
      }),
    ),
    http.get(`/api/v1/projects/${PROJECT}/commerce/catalog`, () =>
      HttpResponse.json({ error: { message: 'No catalog' } }, { status: 404 }),
    ),
    http.get(`/api/v1/projects/${PROJECT}/actions`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      reads.push(params.toString());
      const status = params.get('status');
      const family_ = params.get('family');
      const all = status === 'open' ? [prompt, page] : [];
      const rows = (status === 'measuring' ? [measured] : all).filter(
        (row) => !family_ || row.families.includes(family_),
      );
      return HttpResponse.json(
        actionsPage(rows, {
          status_counts: { open: 3, in_progress: 1, implemented: 2, measuring: 1, done: 4 },
          group_counts: { own_pages: rows.filter((row) => row.group === 'own_pages').length },
        }),
      );
    }),
  );
}

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => window.history.replaceState(null, '', '/actions'));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

const renderActions = () =>
  renderWithProviders(
    <Routes>
      <Route path="/actions" element={<ActionsScreen />} />
      <Route path="/actions/:actionId" element={<p>Action detail</p>} />
      <Route path="/issues" element={<p>Issues</p>} />
    </Routes>,
    { initialEntries: ['/actions'], projectSelection: selection },
  );

/** Every open goal and category header in the tree, top to bottom. */
const headerNames = () =>
  screen
    .getAllByRole('button', { expanded: true })
    .map((button) => button.getAttribute('aria-label'));

describe('Actions', () => {
  it('lists the Issues defects by their tab and rule category beside every other Action, under each goal', async () => {
    serve([]);
    renderActions();

    await screen.findByRole('link', { name: 'Broken links in the site navigation' });
    // Goal, then its categories: technical Issues let AI read the site; content
    // and AEO Issues improve your own pages, before the Actions' categories.
    // An Issues row's category is its rule's; one without a label falls back.
    expect(headerNames()).toEqual([
      'Let AI read your site, 1, blocking',
      'Crawling and indexing, 1',
      'Improve your own pages, 4',
      'Page metadata, 1',
      'Other website issues, 1',
      "Prompts you don't appear in, 1",
      'Your pages, 1',
    ]);

    // A site-level finding reaches the whole site; an Issues row links to that
    // issue open on its Issues tab, and says how far its fix has come.
    const robots = screen.getByRole('link', { name: 'Broken links in the site navigation' });
    const robotsRow = within(robots.closest('tr')!);
    expect(robotsRow.getByText('Whole site')).toBeVisible();
    expect(robotsRow.getByText('Issues')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Pages without a title' })).toHaveAttribute(
      'href',
      `/issues?section=content&issue=${TITLES}&project=${PROJECT}`,
    );
    const schemaRow = within(
      screen.getByRole('link', { name: 'WebSite schema is missing' }).closest('tr')!,
    );
    expect(schemaRow.getByText('32 pages · 3 of 32 pages fixed')).toBeVisible();

    // An Action row is titled by its target alone, never "Improve the existing page: …".
    const pageLink = screen.getByRole('link', { name: '/Categories/…/SCE2001' });
    expect(pageLink).toHaveAttribute('href', `/actions/${PAGE_ACTION}?project=${PROJECT}`);
    const pageRow = within(pageLink.closest('tr')!);
    expect(pageRow.getByText('Improve the existing page · 2 findings')).toBeVisible();
    expect(pageRow.getByText('Search Console')).toBeVisible();

    // The goal strip counts each goal and jumps to it; a project without a catalog has no products goal.
    const goals = within(screen.getByRole('group', { name: 'Goals' }));
    expect(goals.getByRole('button', { name: 'Go to Improve your own pages, 4' })).toBeVisible();
    expect(goals.queryByRole('button', { name: /Improve your products/ })).toBeNull();

    // A goal header folds its categories.
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Improve your own pages, 4' }));
    expect(screen.queryByRole('link', { name: 'Pages without a title' })).toBeNull();
  });

  it('counts each status view and reads the statuses it holds', async () => {
    const reads: string[] = [];
    serve(reads);
    const user = userEvent.setup();
    renderActions();

    await screen.findByRole('link', { name: 'Pages without a title' });
    // Open counts the Issues defects too; Measuring holds declared work as well.
    expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual([
      'Open (6)',
      'In progress (1)',
      'Measuring (3)',
      'Done (4)',
      'Dismissed (0)',
    ]);
    expect(reads).toEqual(['status=open&limit=200']);

    await user.click(screen.getByRole('radio', { name: /^Measuring/ }));
    expect(await screen.findByRole('link', { name: '/pricing' })).toBeVisible();
    expect(window.location.search).toBe('?status=measuring');
    expect(reads.slice(1).sort()).toEqual([
      'status=implemented&limit=200',
      'status=measuring&limit=200',
    ]);
    // Issues rows have their own lifecycle: they are listed under Open only.
    expect(screen.queryByRole('link', { name: 'Pages without a title' })).toBeNull();
  });

  it('leaves Open uncounted when Issues fail, and keeps product work when the catalog fails', async () => {
    serve([]);
    const product = {
      ...actionItem(MEASURED, 'Organic bodysuit', PROJECT),
      target_kind: 'product',
      group: 'products',
    };
    mswServer.use(
      http.get(`/api/v1/projects/${PROJECT}/site-health`, () =>
        HttpResponse.json({ error: { message: 'Unavailable' } }, { status: 500 }),
      ),
      http.get(`/api/v1/projects/${PROJECT}/commerce/catalog`, () =>
        HttpResponse.json({ error: { message: 'Unavailable' } }, { status: 500 }),
      ),
      http.get(`/api/v1/projects/${PROJECT}/actions`, () =>
        HttpResponse.json(
          actionsPage([product], { status_counts: { open: 1 }, group_counts: { products: 1 } }),
        ),
      ),
    );
    renderActions();

    expect(await screen.findByText("Couldn't load Website issues")).toBeVisible();
    expect(screen.getByRole('radio', { name: /^Open/ }).textContent).toBe('Open');
    expect(screen.getByRole('radio', { name: /^Done/ }).textContent).toBe('Done (0)');
    const goals = within(screen.getByRole('group', { name: 'Goals' }));
    expect(goals.getByRole('button', { name: 'Go to Improve your products, 1' })).toBeVisible();
  });

  it('narrows by Source as URL state', async () => {
    const reads: string[] = [];
    serve(reads);
    const user = userEvent.setup();
    renderActions();
    await screen.findByRole('link', { name: 'Pages without a title' });

    await user.click(screen.getByRole('button', { name: /^Source/ }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Issues' }));
    expect(window.location.search).toBe('?source=issues');
    expect(screen.queryByRole('link', { name: '/Categories/…/SCE2001' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Pages without a title' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: /^Source/ }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Search Console' }));
    expect(window.location.search).toBe('?source=search_console');
    expect(await screen.findByRole('link', { name: '/Categories/…/SCE2001' })).toBeVisible();
    expect(reads.at(-1)).toBe('family=search_console&status=open&limit=200');
    expect(screen.queryByRole('link', { name: 'Pages without a title' })).toBeNull();
  });
});
