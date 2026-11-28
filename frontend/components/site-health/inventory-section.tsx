import { useState } from 'react';

import { PageDrawerHost } from '@/components/site-health/page-drawer';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { choiceFilter } from '@/components/ui/all-filters';
import type { TableToolbarProps } from '@/components/ui/filter-bar';
import { Section, SectionHeader, SectionTitle } from '@/components/ui/section';
import { TableCell, TableRow, UrlText } from '@/components/ui/table';
import { Absence } from '@/components/ui/absence';
import { pageKindFilter } from '@/components/site-health/page-kind-select';
import {
  PAGES_FILTER_URL_KEYS,
  pagesFilterParams,
  usePagesFilters,
  usePagesFilterState,
} from '@/components/site-health/pages-filters';
import { PagesTable } from '@/components/site-health/pages-table';
import { RootErrorsBlock } from '@/components/site-health/root-errors-block';
import { SubmittedSearch } from '@/components/site-health/submitted-search';
import { Download, FileText } from '@/lib/icons';
import { type PageFilterParams, type PagesParams, type PagesSort } from '@/lib/api/site-health';
import { siteHealthQueries } from '@/lib/api/site-health-queries';
import type { SiteCrawl } from '@citeladder/contracts';
import { sharedOrigin } from '@/lib/format';
import { useUrlParam } from '@/lib/navigation/url-params';
import { stringUrlCodec, useUrlState, type UrlCodec } from '@/lib/navigation/url-state';
import { PAGE_KINDS } from '@/lib/site-health/page-kinds';
import { useCursorTableQuery } from '@/lib/table/use-cursor-table-query';
import { DEFAULT_PAGES_SORT, statusLabel, type InventoryMode } from '@/lib/site-health/status';
import { StateBlock } from '@/components/ui/state-block';

export function InventorySection({
  mode,
  crawl,
  active,
  exportPages,
}: Readonly<{
  mode: InventoryMode;
  crawl: SiteCrawl | null;
  active: boolean;
  exportPages?: ExportPages;
}>) {
  if (mode === 'scored' && crawl)
    return <ScoredInventory crawl={crawl} active={active} exportPages={exportPages} />;
  return (
    <Section data-testid="inventory-section">
      <SectionHeader>
        <SectionTitle>{mode === 'discovering' ? 'Pages discovered so far' : 'Pages'}</SectionTitle>
      </SectionHeader>
      {mode === 'discovering' && crawl ? (
        <DiscoveringInventory crawl={crawl} />
      ) : (
        <StateBlock kind="empty" icon={FileText} heading="No pages yet" headingLevel={3} />
      )}
    </Section>
  );
}

function DiscoveringInventory({ crawl }: Readonly<{ crawl: SiteCrawl }>) {
  const { page, table } = useCursorTableQuery({
    workspaceId: crawl.workspace_id,
    scopeId: crawl.id,
    scope: null,
    query: (request) => siteHealthQueries.inventory(crawl.workspace_id, crawl.id, request),
    noun: 'pages',
    loading: 'Loading discovered pages…',
    subject: 'the page inventory',
    empty: () => ({
      kind: 'empty',
      icon: FileText,
      headingLevel: 3,
      heading: 'Discovering pages…',
    }),
  });

  const origin = sharedOrigin(page?.items.map((row) => row.display_url) ?? []);
  return (
    <DataTable label="Pages discovered so far" columns={DISCOVERED_COLUMNS} {...table}>
      {page?.items.map((row) => (
        <TableRow key={row.site_url_id}>
          <TableCell>
            <UrlText url={row.display_url} origin={origin} />
          </TableCell>
          <TableCell>
            {row.source ? statusLabel(row.source) : <Absence state="unavailable" label="Unknown" />}
          </TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

const DISCOVERED_COLUMNS: readonly DataTableColumn[] = [
  { key: 'url', label: 'Page URL', kind: 'url' },
  { key: 'source', label: 'Source', kind: 'text', width: 'name' },
];

type ViewKey = 'monitored' | 'all' | 'errors';

const VIEWS: ReadonlyArray<{ key: ViewKey; label: string }> = [
  { key: 'monitored', label: 'Monitored' },
  { key: 'all', label: 'All discovered' },
  { key: 'errors', label: 'Errors' },
];

const VIEW_PARAMS: Readonly<Record<ViewKey, PagesParams>> = {
  monitored: { monitored: true },
  all: {},
  errors: { status: 'error_or_blocked' },
};

const VIEW_CODEC = stringUrlCodec<ViewKey>(
  VIEWS.map((view) => view.key),
  'monitored',
);

const PAGE_KIND_CODEC: UrlCodec<string> = {
  parse: (raw) => PAGE_KINDS.find((pageKind) => pageKind === raw) ?? '',
  serialize: (value) => value || null,
};

const SEARCH_CODEC: UrlCodec<string> = {
  parse: (raw) => raw ?? '',
  serialize: (value) => value.trim() || null,
};

export const PAGES_INVENTORY_URL_KEYS = [
  'pages_view',
  'page_kind',
  'pages_query',
  ...PAGES_FILTER_URL_KEYS,
] as const;

function usePagesInventoryState() {
  const [view, setView] = useUrlState(PAGES_INVENTORY_URL_KEYS[0], VIEW_CODEC);
  const [pageKind, setPageKind] = useUrlState(PAGES_INVENTORY_URL_KEYS[1], PAGE_KIND_CODEC);
  const [query, setQuery] = useUrlState(PAGES_INVENTORY_URL_KEYS[2], SEARCH_CODEC);
  return { view, setView, pageKind, setPageKind, query, setQuery };
}

type ExportPages = Readonly<{
  onExport: (filters: PageFilterParams) => void;
  exporting: boolean;
}>;

function usePagesToolbar({
  crawl,
  active,
  exportPages,
  filters,
}: Readonly<{
  crawl: SiteCrawl;
  active: boolean;
  exportPages: ExportPages | undefined;
  filters: PageFilterParams;
}>): TableToolbarProps {
  const { view, setView, pageKind, setPageKind, query, setQuery } = usePagesInventoryState();
  const pageFilters = usePagesFilters({
    workspaceId: crawl.workspace_id,
    crawlId: crawl.id,
  });
  const shown = choiceFilter({
    id: 'view',
    label: 'Pages',
    value: view,
    defaultValue: 'monitored',
    groups: [
      {
        options: VIEWS.map((item) => ({
          value: item.key,
          label: active && item.key === 'monitored' ? 'Audited' : item.label,
        })),
      },
    ],
    onChange: setView,
  });
  return {
    search: (
      <SubmittedSearch
        key={query}
        query={query}
        onApply={setQuery}
        placeholder="Search page URLs…"
        label="Search pages"
      />
    ),
    filters: [
      shown,
      pageKindFilter({ value: pageKind, onChange: (next) => setPageKind(next) }),
      ...pageFilters,
    ].map((filter) => ({ ...filter, inFilters: true })),
    actions: exportPages ? (
      <Button
        variant="secondary"
        onClick={() => exportPages.onExport(filters)}
        pending={exportPages.exporting}
      >
        <Icon icon={Download} />
        Export CSV
      </Button>
    ) : undefined,
  };
}

function ScoredInventory({
  crawl,
  active,
  exportPages,
}: Readonly<{
  crawl: SiteCrawl;
  active: boolean;
  exportPages: ExportPages | undefined;
}>) {
  const requestedSort = useUrlParam('sort');
  return (
    <ScoredInventoryState
      key={requestedSort ?? ''}
      crawl={crawl}
      active={active}
      requestedSort={requestedSort}
      exportPages={exportPages}
    />
  );
}

function ScoredInventoryState({
  crawl,
  active,
  requestedSort,
  exportPages,
}: Readonly<{
  crawl: SiteCrawl;
  active: boolean;
  requestedSort: string | null;
  exportPages: ExportPages | undefined;
}>) {
  const { view, pageKind, query } = usePagesInventoryState();
  const { rule, indexable, depth, score } = usePagesFilterState();
  const [sort, setSort] = useState<PagesSort>(() => initialPagesSort(requestedSort));

  const activeViewParams: PagesParams =
    active && view === 'monitored'
      ? { ...VIEW_PARAMS.monitored, status: 'completed' }
      : VIEW_PARAMS[view];
  const filters: PageFilterParams = {
    ...pagesFilterParams({ rule, indexable, depth, score }),
    ...activeViewParams,
    page_kind: pageKind || undefined,
    query: query || undefined,
    sort,
  };
  const toolbar = usePagesToolbar({ crawl, active, exportPages, filters });

  const { page, table } = useCursorTableQuery({
    workspaceId: crawl.workspace_id,
    scopeId: crawl.id,
    scope: [view, filters],
    query: (request) =>
      siteHealthQueries.pages(crawl.workspace_id, crawl.id, { ...filters, ...request }),
    noun: 'pages',
    loading: 'Loading pages…',
    subject: 'the pages for this view',
    empty: () => ({
      kind: 'empty',
      icon: FileText,
      heading: emptyPagesHeading(query, active),
      headingLevel: 3,
    }),
  });
  const rootErrors = view === 'errors' ? (page?.root_errors ?? []) : [];

  return (
    <PageDrawerHost workspaceId={crawl.workspace_id}>
      <Section data-testid="inventory-section" tray={rootErrors.length === 0}>
        <RootErrorsBlock errors={rootErrors} />
        <PagesTable
          title="Pages"
          toolbar={toolbar}
          pages={page?.items ?? []}
          sort={sort}
          onSortChange={setSort}
          state={table.state}
          pageSize={table.pageSize}
          pager={table.pager}
          busy={table.busy}
        />
      </Section>
    </PageDrawerHost>
  );
}

function emptyPagesHeading(query: string, active: boolean): string {
  if (query) return `No pages match “${query}”`;
  return active ? 'No pages yet' : 'No pages in this view';
}

function initialPagesSort(value: string | null): PagesSort {
  return value === 'url' ? 'url' : DEFAULT_PAGES_SORT;
}
