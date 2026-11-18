import { fireEvent, render, screen, within } from '@testing-library/react';
import { Inbox } from 'lucide-react';
import { describe, expect, it, vi } from 'vite-plus/test';

import { ApiError } from '@/lib/api/errors';

import { Avatar } from './avatar';
import { Button } from './button';
import { Delta } from './delta';
import { choiceFilter, rangeFilter, singleFilter } from './all-filters';
import { FilterBar, FilterTrigger, pageStripFilters } from './filter-bar';
import { DataTable } from './data-table';
import { Meter } from './meter';
import { Pager, pageNumberControls } from './pager';
import { StateBlock } from './state-block';
import { SearchField } from './search-field';
import { FigureStrip } from './figure-strip';
import { Table, TableCell, TableHeader, TableRow } from './table';
import { SortableTableHead } from './table-heads';
import { SegmentedControl } from './tabs';
import { focusByKeyboard } from '@/test/keyboard-focus';
import { renderWithProviders } from '@/test/render';

import { ArrowLink, TextLink } from './text-link';
import { TooltipProvider } from './tooltip';
import { Section, SectionHeader, SectionTitle } from '@/components/ui/section';

describe('SectionHeader actions', () => {
  it('keeps the actions in the header beside the title', () => {
    render(
      <Section aria-label="Issues">
        <SectionHeader actions={<Button>Export</Button>}>
          <SectionTitle>Issues</SectionTitle>
        </SectionHeader>
      </Section>,
    );
    const header = screen.getByRole('heading', { name: 'Issues' }).closest('header');
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).getByRole('button', { name: 'Export' })).toBeVisible();
  });
});

/** The text a screen reader reads: every text node outside an aria-hidden subtree. */
function spokenText(root: Element) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.closest('[aria-hidden="true"]')) text += node.textContent ?? '';
  }
  return text;
}

describe('Delta', () => {
  it('says the rounded direction in words, tones it by policy and never fakes a zero', () => {
    const { container, rerender } = render(
      <Delta value={-1.24} unit=" pp" policy="lower-is-better" context="vs last week" />,
    );
    const fall = screen.getByText('1.2 pp').closest('[data-direction]');
    expect(fall?.textContent).toBe('down −1.2 ppvs last week');
    // The sign is drawn with no arrow; a screen reader hears the word alone.
    expect(fall ? spokenText(fall) : null).toBe('down 1.2 ppvs last week');
    // A falling rank is an improvement under lower-is-better.
    expect(fall).toHaveAttribute('data-outcome', 'improved');

    // +0.04 rounds to a displayed 0.0: flat, a signed ±0 with its unit, spoken as no change.
    rerender(<Delta value={0.04} unit=" pp" />);
    const flat = container.querySelector('[data-direction]');
    expect(flat).toHaveAttribute('data-direction', 'flat');
    expect(flat?.textContent).toBe('no change±0 pp');
    expect(flat ? spokenText(flat) : null).toBe('no change');

    rerender(
      <TooltipProvider>
        <Delta value={null} missingReason="No comparable run" />
      </TooltipProvider>,
    );
    expect(screen.getByRole('button', { name: 'Not measured' })).toBeInTheDocument();
  });
});

describe('FigureStrip', () => {
  it('names a missing value, prints a real zero, rings a score once and makes a pressable figure a toggle', () => {
    const onSelect = vi.fn();
    const onConnect = vi.fn();
    renderWithProviders(
      <FigureStrip
        label="Delivery"
        segments={[
          {
            key: 'ttfb',
            label: 'TTFB',
            value: null,
            action: { label: 'Connect logs', onSelect: onConnect },
          },
          { key: 'errors', label: 'Errors', value: 0 },
          {
            key: 'score',
            label: 'Crawl',
            score: { value: 72, label: 'Crawl score' },
            sub: 'Last crawl',
            action: { label: 'View details', href: '/issues' },
          },
          {
            key: 'orphans',
            label: 'Orphaned pages',
            value: 3,
            actionLabel: 'View 3 orphaned pages',
            onSelect,
            selected: false,
          },
        ]}
      />,
      { projectSelection: null },
    );
    const group = screen.getByRole('group', { name: 'Delivery' });
    const cell = (label: string) => within(group).getByText(label).closest('[data-figure-cell]');
    expect(cell('TTFB')).toHaveTextContent('Not measured');
    expect(cell('Errors')?.textContent).toBe('Errors0');
    // A score is a ring with its number inside, never a bar or rungs, and the number prints once.
    expect(within(group).getByRole('img', { name: 'Crawl score: 72 out of 100' })).toBeVisible();
    expect(within(group).queryByRole('progressbar')).not.toBeInTheDocument();
    // Two rows: the basis is the label's hint, never a line of its own.
    expect(cell('Crawl')?.textContent).toBe('CrawlLast crawl72');
    expect(
      within(group).getByRole('button', { name: 'Basis of Crawl' }),
    ).toHaveAccessibleDescription('Last crawl');
    // The figure's action is its label, never a link or button of its own.
    fireEvent.click(within(group).getByRole('button', { name: 'TTFB' }));
    expect(onConnect).toHaveBeenCalledOnce();
    expect(within(group).getByRole('link', { name: 'Crawl' })).toHaveAttribute('href', '/issues');
    const toggle = within(group).getByRole('button', { name: 'View 3 orphaned pages' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('puts a comparison window in the figure hint, its absence named like the value', () => {
    render(
      <FigureStrip
        label="Search Console metrics"
        segments={[
          {
            key: 'clicks',
            label: 'Clicks',
            value: '1,204',
            comparison: { label: 'Previous 28 days', value: '980' },
          },
          {
            key: 'ctr',
            label: 'CTR',
            value: '2.1%',
            missingLabel: 'Not measured',
            comparison: { label: 'Previous 28 days', value: null },
          },
        ]}
      />,
    );
    const group = screen.getByRole('group', { name: 'Search Console metrics' });
    const [clicks, ctr] = within(group).getAllByText(/^Previous 28 days/);
    expect(clicks?.closest('[data-figure-comparison]')?.textContent).toBe('Previous 28 days: 980');
    expect(ctr?.closest('[data-figure-comparison]')?.textContent).toBe(
      'Previous 28 days: Not measured',
    );
  });
});

describe('DataTable', () => {
  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'count', label: 'Count', kind: 'number' },
  ] as const;

  it('draws only the rows a short page has and gives way to one empty state, head included', () => {
    const { container, rerender } = render(
      <DataTable title="Runs" columns={columns} pageSize={5} rowCount={2}>
        <TableRow>
          <TableCell>Alpha</TableCell>
          <TableCell numeric>1</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Beta</TableCell>
          <TableCell numeric>2</TableCell>
        </TableRow>
      </DataTable>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Runs' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'Count' })).toBeVisible();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);

    rerender(
      <DataTable
        title="Runs"
        columns={columns}
        pageSize={5}
        state={{ kind: 'empty', icon: Inbox, heading: 'No failed runs' }}
      />,
    );
    // The empty state takes the table's place: no head row is left above it.
    expect(screen.queryByRole('columnheader', { name: 'Count' })).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'No failed runs' })).toBeVisible();
  });

  it('puts an unsortable column caveat behind its header and a note under the table', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <DataTable
          label="Sources"
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'type', label: 'Type', hint: 'How the publisher is classified.' },
          ]}
          footer="Showing the newest 50."
        >
          <TableRow>
            <TableCell>Alpha</TableCell>
            <TableCell>Editorial</TableCell>
          </TableRow>
        </DataTable>
      </TooltipProvider>,
    );
    const head = screen.getByRole('columnheader', { name: 'Type' });
    focusByKeyboard(within(head).getByRole('button', { name: 'Type' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'How the publisher is classified.',
    );
    expect(
      within(screen.getByRole('region', { name: 'Sources' })).getByText('Showing the newest 50.'),
    ).toBeVisible();
  });
});

describe('Meter', () => {
  it('names the bar by its visible label and speaks the shown value, clamped to the maximum', () => {
    const { rerender } = render(<Meter label="Prompt runs" value={120} />);
    const meter = screen.getByRole('meter', { name: 'Prompt runs' });
    expect(meter).toHaveAttribute('aria-valuenow', '100');
    expect(meter).toHaveAttribute('aria-valuetext', '120 / 100');
    expect(screen.getByText('120 / 100')).toBeVisible();

    rerender(<Meter label="ChatGPT" value={42} valueLabel="42%" />);
    expect(screen.getByRole('meter', { name: 'ChatGPT' })).toHaveAttribute('aria-valuetext', '42%');
  });

  it('announces an unmeasured value instead of drawing it as zero', () => {
    render(<Meter label="Mention rate" value={null} />);
    const meter = screen.getByRole('meter', { name: 'Mention rate' });
    expect(meter).not.toHaveAttribute('aria-valuenow');
    expect(meter).toHaveAttribute('aria-valuetext', 'Not measured');
  });
});

describe('SortableTableHead', () => {
  it('announces the sort on the column and sorts from the header button', () => {
    const onSort = vi.fn();
    const head = (descending: boolean) => (
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead
              label="Clicks"
              active
              descending={descending}
              onSort={onSort}
              numeric
            />
            {/* An inactive column has no order, whatever its flag says. */}
            <SortableTableHead label="Page" active={false} descending onSort={vi.fn()} />
          </TableRow>
        </TableHeader>
      </Table>
    );
    const { rerender } = render(head(true));
    expect(screen.getByRole('columnheader', { name: 'Clicks' })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    expect(screen.getByRole('columnheader', { name: 'Page' })).not.toHaveAttribute('aria-sort');
    fireEvent.click(screen.getByRole('button', { name: 'Clicks' }));
    expect(onSort).toHaveBeenCalledOnce();
    rerender(head(false));
    expect(screen.getByRole('columnheader', { name: 'Clicks' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });
});

describe('TextLink', () => {
  it('opens external links safely and renders unsafe ones as text', () => {
    const { rerender } = render(
      <TextLink variant="external" href="https://example.com/a">
        example.com
      </TextLink>,
    );
    const link = screen.getByRole('link', { name: 'example.com (opens in a new tab)' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    rerender(
      <TextLink variant="external" href="javascript:alert(1)">
        unsafe
      </TextLink>,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('unsafe')).toBeInTheDocument();
    expect(screen.queryByText('(opens in a new tab)')).toBeNull();
  });
});

describe('ArrowLink', () => {
  it('links to a route under its label, and is plain text inside a linked card', () => {
    const { unmount } = renderWithProviders(<ArrowLink href="/runs">View all runs</ArrowLink>, {
      projectSelection: null,
    });
    expect(screen.getByRole('link', { name: 'View all runs' })).toHaveAttribute('href', '/runs');
    unmount();

    render(<ArrowLink>Open the report</ArrowLink>);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Open the report')).toBeInTheDocument();
  });
});

describe('FilterBar and FilterTrigger', () => {
  it('lays every row out in one order: view, search, All filters, count, action', () => {
    render(
      <FilterBar
        actions={<Button>Export</Button>}
        status="12 pages"
        filters={[
          choiceFilter({
            id: 'kind',
            label: 'Page kind',
            value: 'faq',
            defaultValue: 'all',
            groups: [
              {
                options: [
                  { value: 'all', label: 'All page kinds' },
                  { value: 'faq', label: 'FAQ' },
                ],
              },
            ],
            onChange: () => undefined,
          }),
        ]}
        search={<SearchField value="" onValueChange={() => undefined} aria-label="Search pages" />}
        view={
          <SegmentedControl
            ariaLabel="Pages shown"
            value="all"
            onChange={() => undefined}
            options={[{ value: 'all', label: 'All' }]}
          />
        }
      />,
    );
    // The row draws its slots in document order, whatever order a page passes them in.
    const order = [
      screen.getByRole('radiogroup', { name: 'Pages shown' }),
      screen.getByRole('searchbox', { name: 'Search pages' }),
      // A lone filter is its own trigger, named by its value.
      screen.getByRole('button', { name: 'Page kind: FAQ' }),
      screen.getByText('12 pages'),
      screen.getByRole('button', { name: 'Export' }),
    ];
    const follows = order
      .slice(1)
      .map((node, index) =>
        Boolean(order[index]!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING),
      );
    expect(follows).toEqual([true, true, true, true]);
  });
  it('draws each filter as its own trigger unless the row is full or a search shares it with more than four', () => {
    const filter = (id: string, value = 'all') =>
      choiceFilter({
        id,
        label: id,
        value,
        defaultValue: 'all',
        groups: [
          {
            options: [
              { value: 'all', label: 'All' },
              { value: 'one', label: 'One' },
            ],
          },
        ],
        onChange: () => undefined,
      });
    const search = <input type="search" aria-label="Search" />;
    const four = [filter('Kind', 'one'), filter('Engine'), filter('Period'), filter('Market')];
    const { rerender } = render(<FilterBar search={search} filters={four} />);
    expect(screen.getByRole('button', { name: 'Kind: One' })).toHaveAttribute('data-active');
    expect(screen.queryByRole('button', { name: /^All filters/ })).toBeNull();

    rerender(<FilterBar search={search} filters={[...four, filter('Status')]} />);
    expect(screen.getByRole('button', { name: 'All filters (1)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kind: One' })).toBeNull();

    rerender(<FilterBar filters={[...four, filter('Status')]} />);
    expect(screen.getByRole('button', { name: 'Status: All' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^All filters/ })).toBeNull();

    // Products: a view, a search and actions fill the row, so its filters group.
    const view = <button type="button">My catalog</button>;
    const actions = <button type="button">Export</button>;
    rerender(<FilterBar view={view} search={search} filters={four} actions={actions} />);
    expect(screen.getByRole('button', { name: 'All filters (1)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kind: One' })).toBeNull();

    // Filters and an action without a search keep their own triggers.
    rerender(<FilterBar filters={four} actions={actions} />);
    expect(screen.getByRole('button', { name: 'Kind: One' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^All filters/ })).toBeNull();

    // A page strip past two filters keeps its window in sight and groups the rest.
    const measurement = { ...filter('measurement'), label: 'Measurement' };
    const period = { ...filter('range'), label: 'Period' };
    rerender(<FilterBar {...pageStripFilters([measurement, ...four, period])} />);
    expect(screen.getByRole('button', { name: 'Measurement: All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Period: All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All filters (1)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kind: One' })).toBeNull();
    rerender(<FilterBar {...pageStripFilters([measurement, filter('Kind', 'one')])} />);
    expect(screen.getByRole('button', { name: 'Kind: One' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^All filters/ })).toBeNull();
  });
  it('prints only the label of a filter at its every value, and the value once set or for a real default', () => {
    const status = (value: string | null) =>
      singleFilter({
        id: 'status',
        label: 'Status',
        allLabel: 'All statuses',
        value,
        options: [{ value: 'open', label: 'Open' }],
        onChange: () => undefined,
      });
    const period = rangeFilter({
      value: '30d',
      defaultValue: '30d',
      options: [
        { value: '30d', label: 'Last 30 days' },
        { value: '7d', label: 'Last 7 days' },
      ],
      onChange: () => undefined,
    });
    const { rerender } = render(<FilterBar filters={[status(null), period]} />);
    // The name keeps the value the trigger no longer prints.
    const idle = screen.getByRole('button', { name: 'Status: All statuses' });
    expect(idle.querySelector('[data-filter-value]')).toBeNull();
    const range = screen.getByRole('button', { name: 'Period: Last 30 days' });
    expect(range.querySelector('[data-filter-value]')?.textContent).toBe('Last 30 days');

    rerender(<FilterBar filters={[status('open'), period]} />);
    const set = screen.getByRole('button', { name: 'Status: Open' });
    expect(set).toHaveAttribute('data-active');
    expect(set.querySelector('[data-filter-value]')?.textContent).toBe('Open');
  });
  it('names a trigger by its visible value', () => {
    render(<FilterTrigger label="Surface" value="ChatGPT" hideLabel active />);
    expect(screen.getByRole('button', { name: 'Surface: ChatGPT' })).toBeInTheDocument();
  });
  it('sizes a trigger to its options without adding them to its text', () => {
    render(
      <FilterTrigger
        label="Surface"
        value="ChatGPT"
        hideLabel
        sizeTo={['All surfaces', 'ChatGPT', 'Google AI Overviews']}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Surface: ChatGPT' });
    // The longest option is reserved as generated content, never readable text.
    expect(trigger.textContent).toBe('ChatGPT');
    expect(trigger.querySelector('[data-size="Google AI Overviews"]')).not.toBeNull();
  });
});

describe('Pager', () => {
  it('steps page numbers and hides when there is nowhere to go', () => {
    const onPageChange = vi.fn();
    const { rerender } = render(
      <Pager
        range={{ from: 1, to: 10, total: 12, noun: 'prompts' }}
        {...pageNumberControls(1, 2, onPageChange)}
      />,
    );
    // The range is a polite status, so a page turn is announced.
    expect(screen.getByRole('status')).toHaveTextContent('1–10 of 12 prompts');
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPageChange).toHaveBeenCalledWith(2);

    rerender(
      <Pager
        hideWhenSinglePage
        canPrev={false}
        canNext={false}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('StateBlock', () => {
  it('states an inline absence as one line with its one action', () => {
    render(
      <StateBlock kind="empty" inline message="No rules yet." action={<Button>Add rule</Button>} />,
    );
    expect(screen.getByText('No rules yet.')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add rule' })).toBeInTheDocument();
  });

  it('announces loading only after the delay, then reports a failed read with its retry', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<StateBlock kind="loading" label="Loading issues…" />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(await screen.findByRole('status', { name: 'Loading issues…' })).toBeInTheDocument();

    rerender(
      <StateBlock
        kind="error"
        error={new ApiError('Temporarily unavailable', 503, '')}
        title="Couldn't load the issues"
        fallback="The request failed or timed out."
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText("Couldn't load the issues")).toBeVisible();
    expect(screen.getByText('Temporarily unavailable')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('keeps a shown spinner when the next owner of the same wait takes over', async () => {
    const { rerender } = render(<StateBlock key="shell" kind="loading" label="Loading shell…" />);
    expect(await screen.findByRole('status', { name: 'Loading shell…' })).toBeInTheDocument();

    // A different owner's box (a fresh mount) continues the visible wait at once.
    rerender(<StateBlock key="page" kind="loading" label="Loading page…" />);
    expect(screen.getByRole('status', { name: 'Loading page…' })).toBeInTheDocument();

    // A wait that starts with nothing showing is still held back.
    rerender(<p>Loaded</p>);
    rerender(<StateBlock key="section" kind="loading" label="Loading section…" />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(await screen.findByRole('status', { name: 'Loading section…' })).toBeInTheDocument();
  });

  it('states a first-use absence with its heading and one action', () => {
    render(
      <StateBlock
        kind="empty"
        icon={Inbox}
        heading="No issues yet"
        description="Run a crawl to find issues."
        action={<Button>Run crawl</Button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'No issues yet' })).toBeVisible();
    expect(screen.getByText('Run a crawl to find issues.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Run crawl' })).toBeVisible();
  });

  it('heads an empty state inside a card one rung under the page, unless told otherwise', () => {
    render(
      <>
        <Section>
          <StateBlock kind="empty" icon={Inbox} heading="No mentions yet" />
        </Section>
        <Section>
          <StateBlock kind="empty" icon={Inbox} heading="No sources yet" headingLevel={2} />
        </Section>
      </>,
    );
    expect(screen.getByRole('heading', { name: 'No mentions yet' }).tagName).toBe('H3');
    expect(screen.getByRole('heading', { name: 'No sources yet' }).tagName).toBe('H2');
  });

  it('says a compact absence in one line with its action and no heading', () => {
    render(
      <StateBlock
        kind="empty"
        inline
        compact
        message="No competitors tracked."
        action={<Button>Add competitor</Button>}
      />,
    );
    expect(screen.getByText('No competitors tracked.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add competitor' })).toBeVisible();
    expect(screen.queryByRole('heading')).toBeNull();
  });
});

describe('Avatar', () => {
  it('shows the initials but stays out of the accessibility tree', () => {
    render(<Avatar name="test.user@example.test" />);
    expect(screen.getByText('TE')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
  });
});
