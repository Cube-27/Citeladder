import { delay, http, HttpResponse, type HttpResponseResolver } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { makeProject } from '@/test/fixtures/project';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders as raw, selectionAs, type TestRole } from '@/test/render';
import type { PageDetail } from '@citeladder/contracts';

import { parseAgentHandoff } from '@/lib/agent/handoff-params';
import type { Action } from '@/lib/api/actions';
import { PageDrawerHost } from './page-drawer';
import {
  CRAWL,
  GROUP_H,
  ISSUE_H,
  ISSUE_L,
  URL_ID,
  pageDetail as detail,
} from './url-detail.test-support';

const NEW_CRAWL = '55555555-5555-4555-8555-555555555555';
const TASK_ID = '66666666-6666-4666-8666-666666666666';
const PAGE = 'Best&Less Online';

function resolvedIssue(id: string, title: string) {
  return {
    id,
    crawl_id: CRAWL,
    rule_id: 'technical.title_present',
    dimension: 'technical',
    category: 'metadata',
    severity: 'medium',
    title,
    description: 'The page has no title.',
    remediation: 'Add a title.',
    analyzer_version: 'a1',
    rule_version: 'r1',
    created_at: '2026-07-01T00:00:00Z',
  };
}

function renderDrawer(role: TestRole = 'owner') {
  window.history.replaceState(null, '', '/site');
  return raw(
    <PageDrawerHost workspaceId={makeProject().workspace_id} linked={`${CRAWL}_${URL_ID}`} />,
    {
      projectSelection: { ...selectionAs(role), activeProject: makeProject() },
    },
  );
}

const opened = () => screen.findByRole('dialog', { name: PAGE });

async function openIssues(count: number) {
  const user = userEvent.setup();
  renderDrawer();
  const drawer = await opened();
  await user.click(await within(drawer).findByRole('tab', { name: /^Issues/ }));
  const heading = await within(drawer).findByRole('heading', { name: `All issues (${count})` });
  return { user, list: heading.closest('section')! };
}

async function openHistory(history: HttpResponseResolver) {
  mswServer.use(
    ...handlers(detail()),
    http.get(`/api/v1/site-crawls/${CRAWL}/pages/${URL_ID}/issue-history`, history),
  );
  const user = userEvent.setup();
  renderDrawer();
  await user.click(await screen.findByRole('tab', { name: 'History' }));
  return { user, drawer: await screen.findByRole('tabpanel', { name: 'History' }) };
}

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  mswServer.resetHandlers();
  vi.unstubAllGlobals();
});
afterAll(() => mswServer.close());

const budget = (remaining: number) => ({
  limit: 50,
  used: 50 - remaining,
  remaining,
  resets_at: '2026-12-20T00:00:00.000Z',
});

function handlers(pageDetail: PageDetail, pageCrawlsLeft = 50) {
  return [
    http.get(`/api/v1/site-crawls/${CRAWL}/pages/${URL_ID}`, () => HttpResponse.json(pageDetail)),
    http.get('/api/v1/projects/:projectId/crawl-budgets', () =>
      HttpResponse.json({ full_crawls: budget(10), page_crawls: budget(pageCrawlsLeft) }),
    ),
  ];
}

describe('URL drawer', () => {
  it('recovers a failed page read with its request reference and exact retry', async () => {
    let reads = 0;
    let available = false;
    mswServer.use(
      http.get(`/api/v1/site-crawls/${CRAWL}/pages/${URL_ID}`, () => {
        reads += 1;
        return available
          ? HttpResponse.json(detail())
          : HttpResponse.json(
              { error: { message: 'Page temporarily unavailable' } },
              { status: 503, headers: { 'X-Request-ID': 'page-read-reference' } },
            );
      }),
      ...handlers(detail()),
    );
    renderDrawer();
    expect(
      await screen.findByText(
        "Couldn't load this page. It may not exist in this crawl.",
        {},
        { timeout: 4500 },
      ),
    ).toBeInTheDocument();
    const beforeRetry = reads;
    available = true;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Re-audit this page' })).toBeInTheDocument();
    expect(reads).toBe(beforeRetry + 1);
    expect(await opened()).toBeInTheDocument();
  });

  it('reports access failures without implying the page is missing or exposing retry', async () => {
    mswServer.use(
      http.get(`/api/v1/site-crawls/${CRAWL}/pages/${URL_ID}`, () =>
        HttpResponse.json({ error: { message: 'Workspace access denied' } }, { status: 403 }),
      ),
    );
    renderDrawer();
    expect(await screen.findByText('Workspace access denied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByText(/may not exist/)).not.toBeInTheDocument();
  });

  it('opens resolved issue history only when asked', async () => {
    let historyReads = 0;
    mswServer.use(
      ...handlers(detail()),
      http.get(`/api/v1/site-crawls/${CRAWL}/pages/${URL_ID}/issue-history`, () => {
        historyReads += 1;
        return HttpResponse.json({
          items: [resolvedIssue(ISSUE_L, 'Page title is missing')],
          next_cursor: null,
          current_analysis_finalized: true,
        });
      }),
    );
    const user = userEvent.setup();
    renderDrawer();

    await user.click(await screen.findByRole('tab', { name: 'History' }));
    const drawer = await screen.findByRole('tabpanel', { name: 'History' });
    expect(await within(drawer).findByText('Page title is missing')).toBeInTheDocument();
    expect(within(drawer).getByRole('columnheader', { name: 'Last found' })).toBeInTheDocument();
    expect(historyReads).toBe(1);
  });

  it('keeps the resolved issues and the pager in place while the next history page loads', async () => {
    const { user, drawer } = await openHistory(async ({ request }) => {
      const next = new URL(request.url).searchParams.has('cursor');
      if (next) await delay(300);
      return HttpResponse.json({
        items: [
          next ? resolvedIssue(ISSUE_H, 'Older issue') : resolvedIssue(ISSUE_L, 'Newer issue'),
        ],
        next_cursor: next ? null : 'page-2',
        current_analysis_finalized: true,
      });
    });
    const table = within(drawer).getByRole('region', { name: 'Resolved issues' });
    await user.click(await within(drawer).findByRole('button', { name: 'Next page' }));
    expect(within(drawer).getByText('Newer issue')).toBeInTheDocument();
    expect(table).toHaveAttribute('aria-busy', 'true');
    expect(within(drawer).getByRole('button', { name: 'Previous page' })).toBeInTheDocument();
    expect(await within(drawer).findByText('Older issue')).toBeInTheDocument();
    expect(within(drawer).queryByText('Newer issue')).not.toBeInTheDocument();
  });

  it('says inside the history table that resolved issues wait for the current analysis', async () => {
    const { drawer } = await openHistory(() =>
      HttpResponse.json({ items: [], next_cursor: null, current_analysis_finalized: false }),
    );
    const table = within(drawer).getByRole('region', { name: 'Resolved issues' });
    expect(
      await within(table).findByRole('heading', { name: 'Analysis not finished' }),
    ).toBeInTheDocument();
  });

  it('puts the re-audit above the page sections, only for a role that may run one', async () => {
    mswServer.use(...handlers(detail()));
    const { unmount } = renderDrawer();
    const drawer = await opened();
    const rerun = await within(drawer).findByRole('button', { name: 'Re-audit this page' });
    const overview = within(drawer).getByRole('tabpanel', { name: 'Overview' });
    expect(rerun.compareDocumentPosition(overview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(overview.contains(rerun)).toBe(false);
    unmount();

    renderDrawer('viewer');
    expect(await within(await opened()).findByRole('tab', { name: 'History' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Re-audit/ })).toBeNull();
  });

  it('lists the actions on this URL and offers the Agent only while one is open', async () => {
    const action = (id: string, label: string, status: Action['status']): Action => ({
      id,
      project_id: makeProject().id,
      target_kind: 'issue_family',
      target_label: label,
      target_url: null,
      target_prompt_id: null,
      origin: 'evidence',
      status,
      measurement: null,
      priority_score: 50,
      priority_band: 'high',
      families: ['site_health'],
      approach: 'fix_technical',
      goal: 'read_site',
      grouping: 'aeo',
      skill_id: 'technical_health',
      member_count: 1,
      declarable_member_count: 1,
      page_count: 3,
      summary: null,
      handoff: { context: 'action', message: 'Fix it.' },
      evidence_cleared_at: null,
      created_at: '2026-11-10T10:00:00Z',
      updated_at: '2026-11-10T10:00:00Z',
    });
    const OPEN_ID = '77777777-7777-4777-8777-777777777777';
    const DISMISSED = action(
      '88888888-8888-4888-8888-888888888888',
      'Meta description too long',
      'dismissed',
    );
    const serve = (items: Action[]) =>
      mswServer.use(
        ...handlers(detail()),
        http.get(`/api/v1/projects/:projectId/urls/${URL_ID}/actions`, () =>
          HttpResponse.json({
            site_url_id: URL_ID,
            url: 'https://acme.test/',
            page_kind: 'home',
            last_crawled_at: '2026-11-10T10:00:00Z',
            items,
          }),
        ),
      );
    const user = userEvent.setup();
    serve([action(OPEN_ID, 'Form controls missing accessible names', 'open'), DISMISSED]);
    const { unmount } = renderDrawer();
    const drawer = await opened();
    const tab = await within(drawer).findByRole('tab', { name: /^Actions/ });
    await waitFor(() => expect(tab).toHaveTextContent('Actions (2)'));
    await user.click(tab);
    const list = within(drawer).getByRole('list', { name: 'Actions on this URL' });
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([`/actions/${OPEN_ID}`, `/actions/${DISMISSED.id}`]);
    const agent = within(drawer).getByRole('link', { name: 'Fix this URL with Agent' });
    expect(
      parseAgentHandoff(new URL(agent.getAttribute('href')!, 'http://x').searchParams).context,
    ).toMatchObject({ url_actions_reference: { site_url_id: URL_ID } });
    unmount();

    serve([DISMISSED]);
    renderDrawer();
    const only = await within(await opened()).findByRole('tab', { name: /^Actions/ });
    await waitFor(() => expect(only).toHaveTextContent('Actions (1)'));
    expect(screen.queryByRole('link', { name: 'Fix this URL with Agent' })).toBeNull();
  });

  it('renders the placeholder (not "0 ms") for an unmeasured TTFB (B6)', async () => {
    mswServer.use(
      ...handlers(
        detail({
          delivery: {
            field_cwv_available: false,
            status_code: 200,
            ttfb_ms: 0,
            wire_bytes: 40000,
            decoded_bytes: 145408,
            html_bytes: 145408,
            http_version: 'HTTP/2',
            compression: 'gzip',
            cache_control: 'no-cache',
            blocking_resource_count: 0,
          },
        }),
      ),
    );
    renderDrawer();
    const drawer = await opened();
    expect(await within(drawer).findByText('142 KB')).toBeInTheDocument();
    expect(within(drawer).queryByText('0 ms')).not.toBeInTheDocument();
    expect(within(drawer).getAllByText('Not measured').length).toBeGreaterThan(0);
  });

  it('tells the person to wait when a crawl is running, and keeps the page open', async () => {
    mswServer.use(
      ...handlers(detail({ analysis_status: 'completed' })),
      http.post(`/api/v1/site-crawls/${CRAWL}/pages/${URL_ID}/rerun`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'crawl_already_active',
              message: 'A crawl is already running for this project. Try again when it ends.',
            },
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderDrawer();
    await user.click(await screen.findByRole('button', { name: 'Re-audit this page' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A crawl is already running for this project. Try again when it ends.',
    );
    expect(await opened()).toBeInTheDocument();
  });

  it('a rerun shows its own one-page crawl in the same drawer and polls it until it settles', async () => {
    const statuses: PageDetail['analysis_status'][] = ['pending', 'running', 'completed'];
    let reads = 0;
    mswServer.use(
      ...handlers(detail({ analysis_status: 'completed' })),
      http.post(`/api/v1/site-crawls/${CRAWL}/pages/${URL_ID}/rerun`, () =>
        HttpResponse.json(
          {
            crawl_id: NEW_CRAWL,
            site_url_id: URL_ID,
            task_id: TASK_ID,
            analysis_status: 'pending',
          },
          { status: 202 },
        ),
      ),
      http.get(`/api/v1/site-crawls/${NEW_CRAWL}/pages/${URL_ID}`, () => {
        const status = statuses[Math.min(reads, statuses.length - 1)];
        reads += 1;
        return HttpResponse.json(detail({ crawl_id: NEW_CRAWL, analysis_status: status }));
      }),
    );
    const user = userEvent.setup();
    renderDrawer();
    await user.click(await screen.findByRole('button', { name: 'Re-audit this page' }));

    expect(await screen.findByText(/^(Pending|Running)$/)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/site');
    await waitFor(() => expect(reads).toBeGreaterThanOrEqual(statuses.length), {
      timeout: 15_000,
    });
    await waitFor(() => expect(screen.queryByText('Running')).not.toBeInTheDocument());
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
  }, 20_000);

  it('disables the re-audit and says why when the single-page crawls are used up', async () => {
    mswServer.use(...handlers(detail({ analysis_status: 'completed' }), 0));
    renderDrawer();

    await screen.findByText(
      'All 50 single-page crawls for this period are used. More from 2026-12-20.',
    );
    expect(screen.getByRole('button', { name: 'Re-audit this page' })).toBeDisabled();
  });

  it('lists every issue once in one list, worst first, with its severity, each row opening its fix', async () => {
    const [low, high] = detail().issues;
    mswServer.use(
      ...handlers(
        detail({
          issues: [
            { ...low!, remediation: 'Add FAQPage markup to the questions.' },
            high!,
            {
              ...low!,
              occurrence_id: 'ffffffff-1111-4111-8111-111111111111',
              rule_id: 'technical.meta_description_present',
              issue_title: 'Missing meta description',
              severity: 'medium',
              evidence: { present: false },
            },
          ],
        }),
      ),
    );
    const { user, list } = await openIssues(3);
    const rows = within(list).getAllByRole('button', { expanded: false });
    expect(rows.map((row) => row.textContent)).toEqual([
      'WebSite schema is missingHighAEO',
      'Missing meta descriptionMediumAEO',
      'FAQ schema not presentLowAEO',
    ]);
    await user.click(rows[2]!);
    await user.click(rows[0]!);
    for (const title of ['WebSite schema is missing', 'FAQ schema not present'])
      expect(within(list).getAllByText(title)).toHaveLength(1);
    const faq = document.getElementById(rows[2]!.getAttribute('aria-controls')!)!;
    expect(within(faq).getByText('Add FAQPage markup to the questions.')).toBeInTheDocument();
    const website = document.getElementById(rows[0]!.getAttribute('aria-controls')!)!;
    const issue = parseAgentHandoff(
      new URL(
        within(website).getByRole('link', { name: 'Ask agent' }).getAttribute('href')!,
        'http://x',
      ).searchParams,
    );
    expect(issue.context).toEqual({
      issue_group_reference: { crawl_id: CRAWL, group_id: GROUP_H, site_url_id: URL_ID },
    });
  });

  it('shows five issues until asked for all, and opens the one chosen in place', async () => {
    const [base] = detail().issues;
    const issues = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh'].map(
      (name, index) => ({
        ...base!,
        occurrence_id: `ffffffff-${String(index).padStart(4, '0')}-4111-8111-111111111111`,
        issue_title: `${name} issue`,
      }),
    );
    mswServer.use(...handlers(detail({ issues })));
    const { user, list } = await openIssues(7);

    expect(within(list).getByText('Fifth issue')).toBeInTheDocument();
    expect(within(list).queryByText('Sixth issue')).toBeNull();
    await user.click(within(list).getByRole('button', { name: 'View all 7 issues' }));
    const seventh = within(list).getByRole('button', { name: /Seventh issue/ });
    await user.click(seventh);
    expect(seventh).toHaveAttribute('aria-expanded', 'true');
    const body = document.getElementById(seventh.getAttribute('aria-controls')!)!;
    expect(within(body).getByRole('button', { name: 'Copy fix prompt' })).toBeVisible();
    expect(within(list).getAllByRole('button', { expanded: true })).toEqual([seventh]);
  });

  it('says a page has nothing to fix only once its audit finished', async () => {
    mswServer.use(...handlers(detail({ issues: [] })));
    const { list } = await openIssues(0);
    expect(within(list).getByText('No issues found.')).toBeInTheDocument();
  });

  it('does not call a page clean before its audit finishes', async () => {
    mswServer.use(...handlers(detail({ issues: [], analysis_status: 'pending' })));
    const user = userEvent.setup();
    renderDrawer();
    await user.click(await within(await opened()).findByRole('tab', { name: /^Issues/ }));

    expect(await screen.findByText('Audit not finished.')).toBeInTheDocument();
    expect(screen.queryByText('No issues found.')).not.toBeInTheDocument();
  });
});
