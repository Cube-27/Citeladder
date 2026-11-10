import { delay, http, HttpResponse } from 'msw';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test';

import { makePageSummary, makeSiteCrawl, SITE_HEALTH_UUID_2 } from '@/test/fixtures/site-health';
import { mswServer } from '@/test/msw-server';
import { renderWithProviders } from '@/test/render';
import { FilterBar } from '@/components/ui/filter-bar';
import { InventorySection, usePagesInventoryControls } from './inventory-section';

/** The control band the screen draws above the inventory. */
function PagesControls({ enabled, active }: Readonly<{ enabled: boolean; active: boolean }>) {
  return <FilterBar {...usePagesInventoryControls({ enabled, active })} />;
}

/** The Pages tab as the screen composes it: the control band, then the inventory. */
function PagesBrowser() {
  return (
    <>
      <PagesControls enabled active={false} />
      <InventorySection mode="scored" crawl={makeSiteCrawl()} active={false} />
    </>
  );
}

const PAGES = `/api/v1/site-crawls/${SITE_HEALTH_UUID_2}/pages`;
const INVENTORY = `/api/v1/site-crawls/${SITE_HEALTH_UUID_2}/inventory`;
const LATER_PAGE = '33333333-3333-4333-8333-333333333333';

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

describe('InventorySection', () => {
  it('keeps the page browser’s rows and pager on screen while the next page loads', async () => {
    mswServer.use(
      http.get(PAGES, async ({ request }) => {
        const next = new URL(request.url).searchParams.has('cursor');
        if (next) await delay(300);
        return HttpResponse.json({
          items: [
            next
              ? makePageSummary({ site_url_id: LATER_PAGE, title: 'Pricing' })
              : makePageSummary({ title: 'Homepage' }),
          ],
          next_cursor: next ? null : 'page-2',
          root_errors: [],
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<InventorySection mode="scored" crawl={makeSiteCrawl()} active={false} />);

    await user.click(await screen.findByRole('button', { name: 'Next page' }));

    const table = screen.getByRole('region', { name: 'Pages' });
    expect(within(table).getByText('Homepage')).toBeInTheDocument();
    expect(table).toHaveAttribute('aria-busy', 'true');
    expect(within(table).getByRole('button', { name: 'Previous page' })).toBeInTheDocument();
    expect(await within(table).findByText('Pricing')).toBeInTheDocument();
    expect(within(table).queryByText('Homepage')).not.toBeInTheDocument();
  });

  it('keeps the current tab’s rows on screen while another tab’s first page loads', async () => {
    mswServer.use(
      http.get(PAGES, async ({ request }) => {
        const errors = new URL(request.url).searchParams.get('status') === 'error_or_blocked';
        if (errors) await delay(300);
        return HttpResponse.json({
          items: [
            errors
              ? makePageSummary({ site_url_id: LATER_PAGE, title: 'Broken page' })
              : makePageSummary({ title: 'Homepage' }),
          ],
          next_cursor: null,
          root_errors: [],
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<PagesBrowser />);
    expect(await screen.findByText('Homepage')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Errors & Blocked' }));

    expect(screen.getByText('Homepage')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Pages' })).toHaveAttribute('aria-busy', 'true');
    expect(await screen.findByText('Broken page')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Errors & Blocked' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('asks the server for the page kind picked in the control band', async () => {
    const requested: Array<string | null> = [];
    mswServer.use(
      http.get(PAGES, ({ request }) => {
        const pageKind = new URL(request.url).searchParams.get('page_kind');
        requested.push(pageKind);
        return HttpResponse.json({
          items: [makePageSummary({ title: pageKind === 'faq' ? 'FAQ page' : 'Homepage' })],
          next_cursor: null,
          root_errors: [],
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<PagesBrowser />);
    expect(await screen.findByText('Homepage')).toBeInTheDocument();

    expect(requested.at(-1)).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Filter by page kind:/ }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'FAQ' }));

    expect(await screen.findByText('FAQ page')).toBeInTheDocument();
    expect(requested.at(-1)).toBe('faq');
    expect(window.location.search).toBe('?page_kind=faq');
  });

  it('keeps the view switch in place but disabled until the pages are scored', () => {
    renderWithProviders(<PagesControls enabled={false} active />);
    const views = screen
      .getAllByRole('radio')
      .map((radio) => [radio.textContent, radio.hasAttribute('disabled')]);
    expect(views).toEqual([
      ['Audited so far', true],
      ['All Discovered', true],
      ['Errors & Blocked', true],
    ]);
  });

  it('draws the discovered pages’ first load inside their table', async () => {
    mswServer.use(
      http.get(INVENTORY, async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    renderWithProviders(
      <InventorySection
        mode="discovering"
        crawl={makeSiteCrawl({ status: 'running', discovery_status: 'running' })}
        active
      />,
    );

    const table = screen.getByRole('region', { name: 'Pages discovered so far' });
    expect(within(table).getByRole('columnheader', { name: 'Page URL' })).toBeVisible();
    expect(
      await within(table).findByRole('status', { name: 'Loading discovered pages…' }),
    ).toBeInTheDocument();
  });
});
