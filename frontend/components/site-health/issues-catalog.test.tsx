import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { chooseFilterOption } from '@/test/all-filters';
import { mswServer } from '@/test/msw-server';
import {
  CRAWL,
  ISSUE_A,
  IssuesCatalog,
  URL_A,
  issue,
  issueDetail,
  occurrence,
  pageRow,
  renderIssues,
  summary,
} from './issues-catalog.test-support';

type User = ReturnType<typeof userEvent.setup>;

const OTHER = 'bbbbbbbb-2222-4222-8222-222222222222';
const ISSUES = `/api/v1/site-crawls/${CRAWL}/issues`;
const PAGES = `/api/v1/site-crawls/${CRAWL}/pages`;

function servePages(items = [pageRow()], seen: URLSearchParams[] = []) {
  mswServer.use(
    http.get(PAGES, ({ request }) => {
      seen.push(new URL(request.url).searchParams);
      return HttpResponse.json({ items, next_cursor: null, root_errors: [] });
    }),
  );
  return seen;
}

async function findSetFilter(label: string, value: string) {
  const remove = await screen.findByRole('button', { name: `Remove ${label} filter` });
  expect(remove.parentElement).toHaveTextContent(value);
  return remove;
}

async function chooseFilter(user: User, label: string, choice: string) {
  await chooseFilterOption(user, label, choice);
}

async function openIssue(user: User, title: string) {
  await user.click(await screen.findByRole('button', { name: title }));
  return screen.findByRole('region', { name: title });
}

function currentUrl(): string {
  return window.location.pathname + window.location.search;
}

function serveIssues(items = [issue()], seen: URLSearchParams[] = [], nextCursor?: string) {
  mswServer.use(
    http.get(ISSUES, ({ request }) => {
      seen.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        items,
        next_cursor: nextCursor ?? null,
        summary,
      });
    }),
  );
  return seen;
}

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => {
  window.history.replaceState(null, '', '/issues');
  mswServer.use(
    http.get(`${ISSUES}/${ISSUE_A}`, () => HttpResponse.json(issueDetail())),
    http.get(PAGES, () =>
      HttpResponse.json({ items: [pageRow()], next_cursor: null, root_errors: [] }),
    ),
    http.get(`/api/v1/site-crawls/${CRAWL}`, () =>
      HttpResponse.json({ error: { message: 'Not found' } }, { status: 404 }),
    ),
    http.get(`/api/v1/site-crawls/${CRAWL}/issue-fixes`, () =>
      HttpResponse.json({ crawl_id: CRAWL, items: [] }),
    ),
  );
});
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('IssuesCatalog', () => {
  it('opens on one table of every issue, grouped by kind and ordered by severity', async () => {
    const seen = serveIssues([
      issue(),
      issue({
        group_id: OTHER,
        rule_id: 'technical.canonical_missing',
        dimension: 'technical',
        category: 'indexability',
        title: 'Canonical tag is missing',
      }),
    ]);

    renderIssues(<IssuesCatalog crawlId={CRAWL} />);

    const table = await screen.findByRole('region', { name: 'Issues' });
    await within(table).findByRole('button', { name: 'Canonical tag is missing' });
    expect(
      [...table.querySelectorAll('tbody tr')].map((row) => row.querySelector('td')?.textContent),
    ).toEqual([
      'AEO: schema',
      expect.stringContaining('WebSite schema is missing'),
      'Technical',
      expect.stringContaining('Canonical tag is missing'),
    ]);
    expect(seen.at(-1)?.get('section')).toBeNull();
    expect(seen.at(-1)?.get('sort')).toBe('severity');
    expect(screen.queryByRole('group', { name: 'Issue summary' })).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back to issues' })).toBeNull();
  });

  it('holds the table in its loading state until the list lands', async () => {
    let releaseIssues!: () => void;
    const issuesSettled = new Promise<void>((resolve) => {
      releaseIssues = resolve;
    });
    mswServer.use(
      http.get(ISSUES, async () => {
        await issuesSettled;
        return HttpResponse.json({ items: [issue()], next_cursor: null, summary });
      }),
    );

    renderIssues(<IssuesCatalog crawlId={CRAWL} />);

    expect(await screen.findByRole('status', { name: 'Loading issues…' })).toBeInTheDocument();
    act(() => releaseIssues());
    expect(
      await screen.findByRole('button', { name: 'WebSite schema is missing' }),
    ).toBeInTheDocument();
  });

  it('opens an issue as a page with why, how to fix and its affected pages, and closes it again', async () => {
    serveIssues();
    const user = userEvent.setup();
    renderIssues(<IssuesCatalog crawlId={CRAWL} />);

    const page = await openIssue(user, 'WebSite schema is missing');
    await waitFor(() => expect(currentUrl()).toContain(`issue=${ISSUE_A}`));

    expect(within(page).getByText('Add a JSON-LD WebSite schema.')).toBeInTheDocument();
    const pages = within(page).getByRole('region', { name: 'Affected pages' });
    const row = (await within(pages).findByText('Homepage')).closest('tr')!;
    expect(within(row).getByRole('link')).toHaveAttribute(
      'href',
      `/site?tab=pages&site_page=${CRAWL}_${URL_A}`,
    );
    expect(within(row).getByText('Article')).toBeInTheDocument();

    expect(within(page).queryByRole('link', { name: 'Ask agent' })).toBeNull();

    await user.click(
      within(await screen.findByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', {
        name: 'Issues',
      }),
    );
    await waitFor(() => expect(currentUrl()).not.toContain('issue='));
    expect(currentUrl()).not.toContain('issue=');
  });

  it('opens an addressed issue on load, even one the listed page does not hold', async () => {
    serveIssues();
    servePages([pageRow({ title: 'Pricing page' })]);
    mswServer.use(
      http.get(`${ISSUES}/${OTHER}`, () =>
        HttpResponse.json(issueDetail({ group_id: OTHER, title: 'Canonical tag is missing' })),
      ),
    );

    renderIssues(<IssuesCatalog crawlId={CRAWL} />, `/issues?issue=${OTHER}`);

    const page = await screen.findByRole('region', { name: 'Canonical tag is missing' });
    expect(await within(page).findByText('Pricing page')).toBeInTheDocument();
  });

  it('says when an addressed issue cannot load, retries it, and closes it', async () => {
    serveIssues();
    let attempts = 0;
    mswServer.use(
      http.get(`${ISSUES}/${OTHER}`, () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json({ error: { message: 'Issue not found' } }, { status: 404 })
          : HttpResponse.json(issueDetail({ group_id: OTHER, title: 'Canonical tag is missing' }));
      }),
    );
    const user = userEvent.setup();
    renderIssues(<IssuesCatalog crawlId={CRAWL} />, `/issues?issue=${OTHER}`);

    const pending = await screen.findByRole('region', { name: 'Issue' });
    await user.click(await within(pending).findByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByRole('region', { name: 'Canonical tag is missing' }),
    ).toBeInTheDocument();

    await user.click(
      within(await screen.findByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', {
        name: 'Issues',
      }),
    );
    await waitFor(() => expect(currentUrl()).not.toContain('issue='));
    expect(currentUrl()).not.toContain('issue=');
  });

  it('shows no pagination when everything already fits on one page', async () => {
    serveIssues();
    const user = userEvent.setup();
    renderIssues(<IssuesCatalog crawlId={CRAWL} />);
    const page = await openIssue(user, 'WebSite schema is missing');
    await within(page).findByText('Homepage');

    expect(screen.queryByRole('button', { name: 'First page' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Previous page' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
  });

  it('switches ordering as a server param, from the first page', async () => {
    window.history.replaceState(null, '', '/issues?cursor=page-two&campaign=overview');
    const seen = serveIssues();
    const user = userEvent.setup();
    renderIssues(<IssuesCatalog crawlId={CRAWL} />);
    await screen.findByRole('button', { name: 'WebSite schema is missing' });

    await user.click(screen.getByRole('button', { name: /^Pages/ }));
    await waitFor(() => expect(seen.at(-1)?.get('sort')).toBe('pages'));
    expect(seen.at(-1)?.get('cursor')).toBeNull();
    expect(currentUrl()).toContain('campaign=overview');
  });

  it('seeds the server query from an Overview rule deep link', async () => {
    window.history.replaceState(
      null,
      '',
      '/issues?rule=aeo.website_schema&query=schema&page_kind=article&cursor=page-two&campaign=overview',
    );
    const seen = serveIssues();

    renderIssues(<IssuesCatalog crawlId={CRAWL} />);

    await screen.findByRole('button', { name: 'WebSite schema is missing' });
    expect(screen.getByRole('button', { name: 'First page' })).not.toBeDisabled();
    const sent = seen.at(-1)!;
    expect(sent.get('rule')).toBe('aeo.website_schema');
    expect(sent.get('query')).toBe('schema');
    expect(sent.get('page_kind')).toBe('article');
    expect(sent.get('cursor')).toBe('page-two');
    expect(screen.getByRole('searchbox', { name: 'Search issues' })).toHaveValue('schema');
  });

  it('writes filters to history and reflects back/forward navigation', async () => {
    window.history.replaceState(null, '', '/issues?rule=aeo.website_schema&campaign=overview');
    serveIssues();
    const user = userEvent.setup();
    renderIssues(<IssuesCatalog crawlId={CRAWL} />);
    await screen.findByRole('button', { name: 'WebSite schema is missing' });

    await findSetFilter('Issue', 'WebSite schema is missing');
    await chooseFilter(user, 'Severity', 'Medium');
    await waitFor(() => expect(currentUrl()).toContain('severity=medium'));
    expect(currentUrl()).not.toContain('rule=');
    expect(currentUrl()).toContain('campaign=overview');
    await findSetFilter('Severity', 'Medium');
    expect(screen.queryByRole('button', { name: 'Remove Issue filter' })).toBeNull();

    window.history.back();
    await waitFor(() => expect(currentUrl()).not.toContain('severity=medium'));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Remove Severity filter' })).toBeNull(),
    );

    window.history.forward();
    await waitFor(() => expect(currentUrl()).toContain('severity=medium'));
    await findSetFilter('Severity', 'Medium');
  });

  it('drops a filter-bound cursor while preserving unknown URL params', async () => {
    window.history.replaceState(null, '', '/issues?cursor=page-two&campaign=overview');
    serveIssues();
    const user = userEvent.setup();
    renderIssues(<IssuesCatalog crawlId={CRAWL} />);
    await screen.findByRole('button', { name: 'WebSite schema is missing' });

    await chooseFilter(user, 'Page kind', 'Article');

    await waitFor(() => expect(currentUrl()).toContain('page_kind=article'));
    expect(currentUrl()).not.toContain('cursor=');
    expect(currentUrl()).toContain('campaign=overview');
  });

  it('clears a deep-linked issue filter from its value chip', async () => {
    window.history.replaceState(null, '', '/issues?rule=aeo.website_schema');
    serveIssues();
    const user = userEvent.setup();
    renderIssues(<IssuesCatalog crawlId={CRAWL} />);
    await screen.findByRole('button', { name: 'WebSite schema is missing' });

    await user.click(await findSetFilter('Issue', 'WebSite schema is missing'));
    await waitFor(() => expect(currentUrl()).not.toContain('rule='));
  });

  it('narrows an issue’s pages to the page kind the list is filtered to', async () => {
    window.history.replaceState(null, '', '/issues?page_kind=product');
    serveIssues();
    const seen = servePages();
    const user = userEvent.setup();
    renderIssues(<IssuesCatalog crawlId={CRAWL} />);

    const page = await openIssue(user, 'WebSite schema is missing');
    await within(page).findByText('Homepage');
    expect(seen.at(-1)?.get('page_kind')).toBe('product');
    expect(seen.at(-1)?.get('rule')).toBe('aeo.website_schema');
  });

  it('lists the pages a site-level architecture finding names, not the homepage it is filed on', async () => {
    const depth = issue({
      rule_id: 'architecture.excessive_depth',
      title: 'Pages buried too deeply',
      dimension: 'technical',
      severity: 'medium',
      affected_url_count: 3,
    });
    const deep = (id: string, path: string, title: string, clicks: number) => ({
      url: `https://acme.com${path}`,
      title,
      page_kind: 'article',
      site_url_id: id,
      depth_from_home: clicks,
      parent_site_url_id: URL_A,
    });
    serveIssues([depth]);
    mswServer.use(
      http.get(`${ISSUES}/${ISSUE_A}`, () =>
        HttpResponse.json(
          issueDetail({
            rule_id: 'architecture.excessive_depth',
            affected_url_count: 3,
            occurrences: [
              occurrence({
                rule_id: 'architecture.excessive_depth',
                page_kind: 'homepage',
                evidence: {
                  count: 3,
                  pages: [
                    deep(
                      'dddddddd-2222-4111-8111-111111111111',
                      '/blogs/news/winner',
                      'Winner announced',
                      7,
                    ),
                    deep('dddddddd-3333-4111-8111-111111111111', '/blogs/news/old', '', 5),
                  ],
                  page_kind_counts: { article: 3 },
                  coverage_state: 'unknown',
                },
              }),
            ],
          }),
        ),
      ),
    );
    const user = userEvent.setup();
    renderIssues(<IssuesCatalog crawlId={CRAWL} />);

    const dialog = await openIssue(user, 'Pages buried too deeply');
    const winner = await within(dialog).findByRole('link', { name: /Winner announced/ });
    expect(winner).toHaveAttribute(
      'href',
      `/site?tab=pages&site_page=${CRAWL}_dddddddd-2222-4111-8111-111111111111`,
    );
    expect(within(dialog).getByText('7 clicks from the homepage')).toBeInTheDocument();
    expect(within(dialog).getByText('5 clicks from the homepage')).toBeInTheDocument();
    expect(within(dialog).getByText('Showing 2 of 3 pages.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: /Homepage/ })).not.toBeInTheDocument();
  });

  it('lists a sitewide link finding by the link, with how many pages carry it', async () => {
    serveIssues([issue({ rule_id: 'technical.sitewide_link_redirect', affected_url_count: 438 })]);
    mswServer.use(
      http.get(`${ISSUES}/${ISSUE_A}`, () =>
        HttpResponse.json(
          issueDetail({
            rule_id: 'technical.sitewide_link_redirect',
            affected_url_count: 438,
            occurrences: [
              occurrence({
                rule_id: 'technical.sitewide_link_redirect',
                evidence: {
                  count: 438,
                  linking_page_kinds: ['article'],
                  page_kind_counts: { article: 438 },
                  resolution_source_ids: [],
                  targets: [
                    {
                      url: 'https://acme.com/collections/screens',
                      final_url: 'https://acme.com/collections/simulation/',
                      hops: 1,
                      linking_page_count: 438,
                      pages: [
                        {
                          site_url_id: 'dddddddd-2222-4111-8111-111111111111',
                          url: 'https://acme.com/blogs/news/winner',
                          title: 'Winner announced',
                          page_kind: 'article',
                          artifact_id: 'eeeeeeee-2222-4111-8111-111111111111',
                        },
                      ],
                    },
                  ],
                },
              }),
            ],
          }),
        ),
      ),
    );
    const user = userEvent.setup();
    renderIssues(<IssuesCatalog crawlId={CRAWL} />);

    const dialog = await openIssue(user, 'WebSite schema is missing');
    const link = '/collections/screens → /collections/simulation/';
    expect(await within(dialog).findByText(link)).toBeInTheDocument();
    expect(within(dialog).getByText('On 438 pages, including:')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /Winner announced/ })).toHaveAttribute(
      'href',
      `/site?tab=pages&site_page=${CRAWL}_dddddddd-2222-4111-8111-111111111111`,
    );
  });

  it('lists duplicate metadata by the pages sharing it, each linking to its page', async () => {
    const rule = 'architecture.duplicate_titles';
    const contact = (id: string, path: string) => ({
      site_url_id: id,
      url: `https://acme.com${path}`,
      title: 'Contact us | Acme',
      page_kind: 'about_contact',
    });
    serveIssues([issue({ rule_id: rule, affected_url_count: 3 })]);
    mswServer.use(
      http.get(`${ISSUES}/${ISSUE_A}`, () =>
        HttpResponse.json(
          issueDetail({
            rule_id: rule,
            affected_url_count: 3,
            occurrences: [
              occurrence({
                rule_id: rule,
                evidence: {
                  count: 3,
                  page_kind_counts: { about_contact: 3 },
                  coverage_state: 'complete',
                  duplicate_set_count: 1,
                  duplicate_sets: [
                    {
                      text: 'Contact us | Acme',
                      page_count: 3,
                      pages: [
                        contact('dddddddd-2222-4111-8111-111111111111', '/contact'),
                        contact('dddddddd-3333-4111-8111-111111111111', '/pages/contact'),
                      ],
                    },
                  ],
                },
              }),
            ],
          }),
        ),
      ),
    );
    const user = userEvent.setup();
    renderIssues(<IssuesCatalog crawlId={CRAWL} />);

    const dialog = await openIssue(user, 'WebSite schema is missing');
    expect(
      await within(dialog).findByText('These 3 pages share “Contact us | Acme”'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Including:')).toBeInTheDocument();
    const links = within(dialog).getAllByRole('link', { name: /Contact us \| Acme/ });
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `/site?tab=pages&site_page=${CRAWL}_dddddddd-2222-4111-8111-111111111111`,
      `/site?tab=pages&site_page=${CRAWL}_dddddddd-3333-4111-8111-111111111111`,
    ]);
    expect(within(dialog).getByText('Showing 2 of 3 pages.')).toBeInTheDocument();
  });

  it('shows New and Fixed since the previous crawl, and a dash when unknown', async () => {
    serveIssues([issue({ affected_url_count: 2, new_url_count: 2, resolved_url_count: null })]);
    renderIssues(<IssuesCatalog crawlId={CRAWL} />);

    const row = (await screen.findByRole('button', { name: 'WebSite schema is missing' })).closest(
      'tr',
    )!;
    const cells = within(row).getAllByRole('cell');
    expect(cells[2]).toHaveTextContent('2');
    expect(cells[4]).toHaveTextContent('2');
    expect(cells[5]).toHaveTextContent('—');
  });

  it('applies a severity filter as a server param (not a client filter)', async () => {
    const seen = serveIssues();
    const user = userEvent.setup();
    renderIssues(<IssuesCatalog crawlId={CRAWL} />);
    await screen.findByRole('button', { name: 'WebSite schema is missing' });

    await chooseFilter(user, 'Severity', 'Medium');
    await waitFor(() => expect(seen.at(-1)?.get('severity')).toBe('medium'));
  });

  it('lists every check failure with its severity, and the Severity filter sends only a severity', async () => {
    const seen: Array<string | null> = [];
    mswServer.use(
      http.get(ISSUES, ({ request }) => {
        const params = new URL(request.url).searchParams;
        seen.push(params.toString());
        return HttpResponse.json({
          items: [
            issue(),
            issue({
              group_id: OTHER,
              rule_id: 'technical.title_length_band',
              title: 'Title length outside recommended band',
              severity: 'low',
            }),
          ],
          next_cursor: null,
          summary,
        });
      }),
    );

    const user = userEvent.setup();
    renderIssues(<IssuesCatalog crawlId={CRAWL} />);
    const table = screen.getByRole('region', { name: 'Issues' });
    expect(
      await within(table).findByRole('button', { name: 'Title length outside recommended band' }),
    ).toBeInTheDocument();
    const row = within(table)
      .getByRole('button', { name: 'Title length outside recommended band' })
      .closest('tr')!;
    expect(within(row).getByText('Low')).toBeInTheDocument();

    await chooseFilter(user, 'Severity', 'High');
    await waitFor(() => expect(seen.at(-1)).toContain('severity=high'));
    expect(seen.join('&')).not.toContain('finding_class');
  });

  it('wires the page-kind filter as a server param, set and cleared', async () => {
    const seen = serveIssues();
    const user = userEvent.setup();
    renderIssues(<IssuesCatalog crawlId={CRAWL} />);
    await screen.findByRole('button', { name: 'WebSite schema is missing' });
    expect(seen.at(-1)?.get('page_kind')).toBeNull();

    await chooseFilter(user, 'Page kind', 'Article');
    await waitFor(() => expect(seen.at(-1)?.get('page_kind')).toBe('article'));

    await chooseFilter(user, 'Page kind', 'All page kinds');
    await chooseFilter(user, 'Severity', 'Medium');
    await waitFor(() => expect(seen.at(-1)?.get('severity')).toBe('medium'));
    expect(seen.at(-1)?.get('page_kind')).toBeNull();
  });

  it('lists every issue again once the search box is cleared', async () => {
    window.history.replaceState(null, '', '/issues?query=schema');
    const seen = serveIssues();
    const user = userEvent.setup();
    renderIssues(<IssuesCatalog crawlId={CRAWL} />);
    await screen.findByRole('button', { name: 'WebSite schema is missing' });
    expect(seen.at(-1)?.get('query')).toBe('schema');

    await user.click(screen.getByRole('button', { name: 'Clear search' }));

    await waitFor(() => expect(currentUrl()).not.toContain('query='));
    await waitFor(() => expect(seen.at(-1)?.get('query')).toBeNull());
    expect(screen.getByRole('searchbox', { name: 'Search issues' })).toHaveValue('');
  });

  it('pages the issue list by cursor', async () => {
    serveIssues([issue()], [], 'catalog-page-2');
    const user = userEvent.setup();
    renderIssues(<IssuesCatalog crawlId={CRAWL} />);
    await screen.findByRole('button', { name: 'WebSite schema is missing' });

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(currentUrl()).toContain('cursor=catalog-page-2'));
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    await waitFor(() => expect(currentUrl()).not.toContain('cursor='));
  });

  it('says which page types an issue affects, and nothing when it spans none', async () => {
    serveIssues([
      issue({ page_kinds: ['product', 'category'] }),
      issue({ group_id: OTHER, title: 'Canonical tag is missing', page_kinds: [] }),
    ]);
    mswServer.use(
      http.get(`${ISSUES}/${OTHER}`, () =>
        HttpResponse.json(issueDetail({ group_id: OTHER, title: 'Canonical tag is missing' })),
      ),
    );
    const user = userEvent.setup();
    renderIssues(<IssuesCatalog crawlId={CRAWL} />);

    const typed = await openIssue(user, 'WebSite schema is missing');
    expect(within(typed).getByText('Page kinds').nextElementSibling?.textContent).toBe(
      'Product, Category',
    );
    expect(typed.querySelector('dl')).toHaveTextContent('Affected pages32');
    expect(within(typed).getByText('High')).toBeInTheDocument();
    await user.click(
      within(await screen.findByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', {
        name: 'Issues',
      }),
    );
    await waitFor(() => expect(currentUrl()).not.toContain('issue='));

    const untyped = await openIssue(user, 'Canonical tag is missing');
    expect(within(untyped).queryByText('Page kinds')).toBeNull();
  });
});
