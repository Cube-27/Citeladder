import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { mswServer } from '@/test/msw-server';
import { SITE_HEALTH_CRAWL } from '@/test/site-health-api-fixtures';
import { renderWithProviders, selectionAs } from '@/test/render';
import {
  CRAWL,
  ISSUE_A,
  IssuesCatalog,
  issue,
  issueDetail,
  renderIssues,
  summary,
} from './issues-catalog.test-support';

const ISSUES = `/api/v1/site-crawls/${CRAWL}/issues`;
const FIXES = `/api/v1/site-crawls/${CRAWL}/issue-fixes`;
const OPEN = `/issues?issue=${ISSUE_A}`;
const TITLE = 'WebSite schema is missing';
const RERUN = 'ffffffff-1111-4111-8111-111111111111';

const progress = (fixed: number, rerun: number | null) => ({
  group_id: ISSUE_A,
  affected_url_count: 32,
  fixed_url_count: fixed,
  verified_url_count: 0,
  rerun_url_count: rerun,
});

const serveFixes = (rerun: number | null, fixed = 0) =>
  mswServer.use(
    http.get(FIXES, () => HttpResponse.json({ crawl_id: CRAWL, items: [progress(fixed, rerun)] })),
  );

async function openDialog() {
  renderIssues(<IssuesCatalog crawlId={CRAWL} />, OPEN);
  return screen.findByRole('region', { name: TITLE });
}

async function figure(label: string) {
  const term = await within(screen.getByLabelText('Issue figures')).findByText(label);
  return term.closest('[data-figure-cell]')?.querySelector('dd')?.textContent;
}

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => {
  window.history.replaceState(null, '', '/issues');
  mswServer.use(
    http.get(ISSUES, () => HttpResponse.json({ items: [issue()], next_cursor: null, summary })),
    http.get(`${ISSUES}/${ISSUE_A}`, () => HttpResponse.json(issueDetail())),
  );
});
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('Mark fixed and Re-run all in the issue dialog', () => {
  it('marks an issue fixed and shows how many of its pages are fixed', async () => {
    let marked = false;
    mswServer.use(
      http.get(FIXES, () =>
        HttpResponse.json({ crawl_id: CRAWL, items: [progress(marked ? 32 : 0, 3)] }),
      ),
      http.post(`${ISSUES}/${ISSUE_A}/mark-fixed`, () => {
        marked = true;
        return HttpResponse.json(progress(32, 3));
      }),
    );
    const user = userEvent.setup();

    await openDialog();
    expect(await figure('Marked fixed')).toBe('0');
    await user.click(screen.getByRole('button', { name: 'Mark fixed' }));

    await waitFor(async () => expect(await figure('Marked fixed')).toBe('32'));
    expect(await figure('Awaiting re-audit')).toBe('32');
    expect(screen.getByRole('button', { name: 'Mark fixed' })).toBeDisabled();
  });

  it('re-runs an issue’s open tracked pages, refreshes its progress once the re-audit lands, and says why when a crawl is running', async () => {
    let running = false;
    let landed = false;
    mswServer.use(
      http.get(FIXES, () =>
        HttpResponse.json({ crawl_id: CRAWL, items: [progress(landed ? 3 : 0, 3)] }),
      ),
      http.get(`/api/v1/site-crawls/${RERUN}`, () => {
        landed = true;
        return HttpResponse.json({ ...SITE_HEALTH_CRAWL, id: RERUN, status: 'completed' });
      }),
      http.post(`${ISSUES}/${ISSUE_A}/rerun`, () => {
        if (running)
          return HttpResponse.json(
            {
              error: {
                code: 'crawl_already_active',
                message: 'A crawl is already running for this project. Try again when it ends.',
              },
            },
            { status: 409 },
          );
        running = true;
        return HttpResponse.json({ crawl_id: RERUN, page_count: 3 }, { status: 202 });
      }),
    );
    const user = userEvent.setup();

    await openDialog();
    await user.click(await screen.findByRole('button', { name: 'Re-run all' }));
    expect(await screen.findByText('Re-auditing 3 pages.')).toBeInTheDocument();
    await waitFor(async () => expect(await figure('Marked fixed')).toBe('3'));

    await user.click(screen.getByRole('button', { name: 'Re-run all' }));
    expect(
      await screen.findByText(
        'A crawl is already running for this project. Try again when it ends.',
      ),
    ).toBeInTheDocument();
  });

  it('offers no Re-run all for a site-wide issue, even with single-page crawls used up, and a disabled one when no page is left', async () => {
    const usedUp = { limit: 50, used: 50, remaining: 0, resets_at: '2026-12-20T00:00:00.000Z' };
    mswServer.use(
      http.get('/api/v1/projects/:projectId/crawl-budgets', () =>
        HttpResponse.json({
          full_crawls: { ...usedUp, limit: 10, used: 0, remaining: 10 },
          page_crawls: usedUp,
        }),
      ),
    );
    serveFixes(null);
    const { unmount } = renderIssues(<IssuesCatalog crawlId={CRAWL} />, OPEN);
    expect(await screen.findByRole('button', { name: 'Mark fixed' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Re-run all' })).toBeNull();
    unmount();

    serveFixes(0, 4);
    await openDialog();
    expect(await screen.findByRole('button', { name: 'Re-run all' })).toBeDisabled();
  });

  it('shows a viewer how many pages are fixed without Mark fixed or Re-run all', async () => {
    serveFixes(3, 5);
    window.history.replaceState(null, '', OPEN);
    renderWithProviders(<IssuesCatalog crawlId={CRAWL} />, {
      projectSelection: selectionAs('viewer'),
    });

    await screen.findByRole('region', { name: TITLE });
    expect(await figure('Marked fixed')).toBe('5');
    for (const name of ['Mark fixed', 'Re-run all'])
      expect(screen.queryByRole('button', { name })).toBeNull();
  });

  it('says the fix progress could not load instead of hiding the actions', async () => {
    mswServer.use(
      http.get(FIXES, () =>
        HttpResponse.json(
          { error: { code: 'not_found', message: 'Crawl not found' } },
          { status: 404 },
        ),
      ),
    );

    await openDialog();

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark fixed' })).toBeNull();
  });
});
