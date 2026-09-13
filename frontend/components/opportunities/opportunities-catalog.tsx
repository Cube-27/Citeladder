'use client';

import { useEffect, useMemo, useRef } from 'react';
import { EditorialSectionHeader } from '@/components/ui/workspace';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { z } from 'zod';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CursorTableFooter } from '@/components/ui/cursor-table-footer';
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from '@/components/ui/dropdown';
import { AccentEyebrow } from '@/components/ui/eyebrow';
import { Skeleton } from '@/components/ui/skeleton';
import { Pressable } from '@/components/ui/pressable';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EvidenceDrawer } from '@/components/opportunities/evidence-drawer';
import { OPPORTUNITY_STATUS_META } from '@/components/opportunities/opportunity-status-meta';
import { OpportunityStatusBadge } from '@/components/opportunities/opportunity-status-badge';
import { OpportunityTypeBadge } from '@/components/opportunities/opportunity-type-badge';
import { useUpdateOpportunityStatus } from '@/components/opportunities/use-opportunity-status';
import { OpportunityFilterMenu } from '@/components/opportunities/opportunity-filter-menu';
import { opportunitiesQueries, type OpportunitiesParams } from '@/lib/api/opportunities';
import { useActiveWorkspaceId } from '@/lib/project/project-context';
import type {
  Opportunity,
  OpportunitiesPage,
  OpportunityDetail,
  OpportunitySeverity,
  OpportunityStatus,
  OpportunityType,
} from '@/lib/api/types';
import { severityBadgeValue, severityLabel } from '@/lib/site-health/issues';
import { formatAudited } from '@/lib/site-health/status';
import { pageRange, useCursorTable } from '@/lib/table/use-cursor-table';
import {
  setUrlParams,
  stringUrlCodec,
  useUrlState,
  type UrlCodec,
} from '@/lib/navigation/url-state';
import { textRole } from '@/components/ui/typography';

/**
 * Recommendation catalog: next best action + ranked action table + drawer.
 *
 * Server-backed severity/type/status filter menus (never a client-side filter
 * over the current page), a recommendation-first view of the top result, the
 * server-owned priority order without exposing its formula score, a per-row
 * status dropdown, and drill-down into the evidence drawer.
 */

type TypeFilter = 'all' | OpportunityType;
type SeverityFilter = 'all' | OpportunitySeverity;
type StatusFilter = 'active' | OpportunityStatus;
type PathFilter = 'all' | 'owned' | 'earned';

const TYPE_FILTERS: ReadonlyArray<{ key: TypeFilter; label: string }> = [
  { key: 'all', label: 'All types' },
  { key: 'visibility', label: 'Visibility' },
  { key: 'site', label: 'Site' },
  { key: 'traffic', label: 'Traffic' },
  { key: 'topic', label: 'Topic' },
];

const SEVERITY_FILTERS: ReadonlyArray<{ key: SeverityFilter; label: string }> = [
  { key: 'all', label: 'All impact levels' },
  { key: 'critical', label: 'Critical' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
  { key: 'info', label: 'Informational' },
];

// Status labels come from the single source (evidence-drawer's meta record,
// in display order) so chips, the row dropdown, and the drawer never drift.
const STATUS_CHOICES: ReadonlyArray<{ value: OpportunityStatus; label: string }> = (
  Object.keys(OPPORTUNITY_STATUS_META) as OpportunityStatus[]
).map((value) => ({ value, label: OPPORTUNITY_STATUS_META[value].label }));

// The server's no-status-param default IS the active triage queue
// (open + in_progress), so the honest chip label is "Active".
const STATUS_FILTERS: ReadonlyArray<{ key: StatusFilter; label: string }> = [
  { key: 'active', label: 'Active' },
  ...STATUS_CHOICES.map(({ value, label }) => ({ key: value, label })),
];
const PATH_FILTERS: ReadonlyArray<{ key: PathFilter; label: string }> = [
  { key: 'all', label: 'All paths' },
  { key: 'owned', label: 'Owned' },
  { key: 'earned', label: 'Earned' },
];
const typeCodec = stringUrlCodec(
  TYPE_FILTERS.map(({ key }) => key),
  'all',
);
const severityCodec = stringUrlCodec(
  SEVERITY_FILTERS.map(({ key }) => key),
  'all',
);
const statusCodec = stringUrlCodec(
  STATUS_FILTERS.map(({ key }) => key),
  'active',
);
const pathCodec = stringUrlCodec(
  PATH_FILTERS.map(({ key }) => key),
  'all',
);
const uuidSchema = z.uuid();
const selectedCodec: UrlCodec<string | null> = {
  parse: (raw) => (raw && uuidSchema.safeParse(raw).success ? raw : null),
  serialize: (value) => value,
};

function FeaturedRecommendation({
  detail,
  onOpen,
}: Readonly<{ detail: OpportunityDetail; onOpen: () => void }>) {
  // The backend owns target presentation (target_label) — no client helper.
  const target = detail.target_label;
  return (
    <Card className="bg-accent-soft">
      {/* The panel keeps every part of the recommendation — title, status
          metadata, the recommendation itself, its target, and the action — and
          shortens by tightening the rungs between them rather than by dropping
          any of them. It was four `gap-4` rows tall, which made the pale blue
          rectangle, not the recommendation, the biggest thing on the screen. */}
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1.5">
            <AccentEyebrow>Next best action</AccentEyebrow>
            <h2 className={textRole('sectionTitle')}>{detail.title}</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="status" value={severityBadgeValue(detail.severity)}>
                {severityLabel(detail.severity)} impact
              </Badge>
              <OpportunityTypeBadge type={detail.opportunity_type} />
              <OpportunityStatusBadge status={detail.status} />
            </div>
          </div>
          <Button size="sm" onClick={onOpen}>
            Review recommendation
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
        <p className={textRole('body', 'whitespace-pre-line')}>{detail.remediation}</p>
        {target ? (
          <p className="text-muted min-w-0 truncate text-xs" title={target}>
            Applies to {target}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Per-row status control (dropdown → updateStatus mutation). */
function StatusControl({ row, projectId }: Readonly<{ row: Opportunity; projectId: string }>) {
  const workspaceId = useActiveWorkspaceId() ?? '';
  const updateStatus = useUpdateOpportunityStatus(workspaceId, projectId, row.id);
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Pressable
          type="button"
          aria-label={`Change status for ${row.title}`}
          className="w-auto rounded-full"
          // Row click opens the drawer — the status control must not.
          onClick={(event) => event.stopPropagation()}
        >
          <OpportunityStatusBadge status={row.status} />
        </Pressable>
      </DropdownTrigger>
      <DropdownContent>
        {STATUS_CHOICES.map((choice) => (
          <DropdownItem
            key={choice.value}
            disabled={choice.value === row.status || updateStatus.isPending}
            onSelect={() => updateStatus.mutate({ opportunityId: row.id, status: choice.value })}
          >
            {choice.label}
          </DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  );
}

export function OpportunitiesCatalog({ projectId }: Readonly<{ projectId: string }>) {
  const workspaceId = useActiveWorkspaceId() ?? '';
  const scopeKey = `${workspaceId}:${projectId}`;
  const selectionScopeKey = useRef(scopeKey);
  const filters = useCatalogFilters(workspaceId, projectId);
  const listQuery = useQuery(opportunitiesQueries.list(workspaceId, projectId, filters.params));
  const rows = listQuery.data?.items ?? [];
  const featured = useFeaturedRecommendation(rows, filters.statusFilter, filters.pager.cursor);
  const [selectedId, setSelectedId] = useUrlState('selected', selectedCodec);
  const [legacySelection] = useUrlState('opportunity', selectedCodec);
  // Existing inbound links used `opportunity`; accept them once, then leave a
  // canonical URL without adding a history entry.
  useEffect(() => {
    if (!selectedId && legacySelection)
      setUrlParams({ selected: legacySelection, opportunity: null }, 'replace');
  }, [legacySelection, selectedId]);
  useEffect(() => {
    if (selectionScopeKey.current === scopeKey) return;
    selectionScopeKey.current = scopeKey;
    setUrlParams({ selected: null, opportunity: null }, 'replace');
  }, [scopeKey]);
  return (
    <div className="grid gap-[var(--page-section-gap)]">
      <FeaturedSection
        featured={featured}
        onOpen={(id) => setSelectedId(id, selectedId ? 'replace' : 'push')}
      />
      <RecommendationsSection
        projectId={projectId}
        filters={filters}
        listQuery={listQuery}
        rows={rows}
        onOpen={(id) => setSelectedId(id, selectedId ? 'replace' : 'push')}
      />
      <EvidenceDrawer
        opportunityId={selectedId}
        projectId={projectId}
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null, 'replace');
        }}
      />
    </div>
  );
}

function useCatalogFilters(workspaceId: string, projectId: string) {
  const [typeFilter] = useUrlState('type', typeCodec);
  const [severityFilter] = useUrlState('severity', severityCodec);
  const [statusFilter] = useUrlState('status', statusCodec);
  const [pathFilter] = useUrlState('action_path', pathCodec);
  // The project participates: cursors are project-bound server-side, so a
  // project switch must restart paging rather than replay a refused cursor.
  const pager = useCursorTable(
    `opportunities|${workspaceId}|${projectId}|${typeFilter}|${severityFilter}|${statusFilter}|${pathFilter}`,
  );
  const params: OpportunitiesParams = useMemo(
    () => ({
      type: typeFilter === 'all' ? undefined : typeFilter,
      severity: severityFilter === 'all' ? undefined : severityFilter,
      status: statusFilter === 'active' ? undefined : statusFilter,
      action_path: pathFilter === 'all' ? undefined : pathFilter,
      cursor: pager.cursor,
      limit: pager.pageSize,
    }),
    [typeFilter, severityFilter, statusFilter, pathFilter, pager.cursor, pager.pageSize],
  );
  const update = <T extends string>(key: string, value: T, codec: UrlCodec<T>) => {
    setUrlParams({ [key]: codec.serialize(value), selected: null, opportunity: null }, 'push');
    pager.reset();
  };
  return {
    typeFilter,
    setTypeFilter: (value: TypeFilter) => update('type', value, typeCodec),
    severityFilter,
    setSeverityFilter: (value: SeverityFilter) => update('severity', value, severityCodec),
    statusFilter,
    setStatusFilter: (value: StatusFilter) => update('status', value, statusCodec),
    pathFilter,
    setPathFilter: (value: PathFilter) => update('action_path', value, pathCodec),
    pager,
    params,
  };
}

function useFeaturedRecommendation(
  rows: Opportunity[],
  statusFilter: StatusFilter,
  cursor: string | undefined,
) {
  const workspaceId = useActiveWorkspaceId() ?? '';
  const featuredId = statusFilter === 'active' && !cursor ? (rows[0]?.id ?? null) : null;
  const query = useQuery({
    ...opportunitiesQueries.detail(workspaceId, featuredId ?? ''),
    enabled: featuredId !== null,
  });
  // A DISABLED query stays `pending` forever, so "is anything still coming?"
  // cannot be read off the query alone. A project with no recommendations yet
  // — the common first run — has nothing to feature, and the section used to
  // hold a placeholder for it that could never resolve.
  return { detail: query.data ?? null, isLoading: featuredId !== null && query.isPending };
}

function FeaturedSection({
  featured,
  onOpen,
}: Readonly<{
  featured: ReturnType<typeof useFeaturedRecommendation>;
  onOpen: (id: string) => void;
}>) {
  const { detail, isLoading } = featured;
  if (isLoading) return <Skeleton className="h-44 w-full" />;
  if (!detail) return null;
  return <FeaturedRecommendation detail={detail} onOpen={() => onOpen(detail.id)} />;
}

function RecommendationsSection({
  projectId,
  filters,
  listQuery,
  rows,
  onOpen,
}: Readonly<{
  projectId: string;
  filters: ReturnType<typeof useCatalogFilters>;
  listQuery: UseQueryResult<OpportunitiesPage, Error>;
  rows: Opportunity[];
  onOpen: (id: string) => void;
}>) {
  return (
    <section className="grid gap-3" aria-labelledby="recommendations-heading">
      <RecommendationsHeader filters={filters} />
      <RecommendationsBody projectId={projectId} query={listQuery} rows={rows} onOpen={onOpen} />
      {rows.length ? (
        <CursorTableFooter
          {...pageRange(filters.pager.page, filters.pager.pageSize, rows.length)}
          // No exact total: every view here is filtered (type, severity,
          // status, action path) and no persisted count covers a filtered
          // set. The range alone is honest; a live COUNT(*) per navigation
          // is not worth its cost.
          noun="recommendations"
          pageSize={filters.pager.pageSize}
          onPageSizeChange={filters.pager.setPageSize}
          canPrev={filters.pager.canPrev}
          canNext={Boolean(listQuery.data?.next_cursor)}
          onPrev={filters.pager.pop}
          onNext={() => filters.pager.push(listQuery.data?.next_cursor ?? null)}
          busy={listQuery.isFetching}
        />
      ) : null}
    </section>
  );
}

function RecommendationsHeader({
  filters,
}: Readonly<{ filters: ReturnType<typeof useCatalogFilters> }>) {
  return (
    <EditorialSectionHeader
      ruled
      headingId="recommendations-heading"
      title="Prioritized recommendations"
      description="Ordered by expected impact using your latest visibility and site evidence."
      actions={
        <fieldset className="flex flex-wrap items-center gap-2" aria-label="Recommendation filters">
          <OpportunityFilterMenu
            label="Path"
            value={filters.pathFilter}
            options={PATH_FILTERS}
            onChange={filters.setPathFilter}
          />
          <OpportunityFilterMenu
            label="Area"
            value={filters.typeFilter}
            options={TYPE_FILTERS}
            onChange={filters.setTypeFilter}
          />
          <OpportunityFilterMenu
            label="Impact"
            value={filters.severityFilter}
            options={SEVERITY_FILTERS}
            onChange={filters.setSeverityFilter}
          />
          <OpportunityFilterMenu
            label="Status"
            value={filters.statusFilter}
            options={STATUS_FILTERS}
            onChange={filters.setStatusFilter}
          />
        </fieldset>
      }
    />
  );
}

function RecommendationsBody({
  projectId,
  query,
  rows,
  onOpen,
}: Readonly<{
  projectId: string;
  query: UseQueryResult<OpportunitiesPage, Error>;
  rows: Opportunity[];
  onOpen: (id: string) => void;
}>) {
  if (query.isError && !query.data)
    return <Alert tone="danger">Could not load opportunities. Please refresh.</Alert>;
  if (query.isPending && !query.data)
    return (
      <div className="grid gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  if (!rows.length)
    return (
      <div className={textRole('body', 'py-[var(--empty-state-padding)]')}>
        No recommendations match these filters. Try broadening the area, impact, or status.
      </div>
    );
  return <RecommendationsTable projectId={projectId} rows={rows} onOpen={onOpen} />;
}

function RecommendationsTable({
  projectId,
  rows,
  onOpen,
}: Readonly<{ projectId: string; rows: Opportunity[]; onOpen: (id: string) => void }>) {
  return (
    <Table className="min-w-[48rem] table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[48%]">Recommendation</TableHead>
          <TableHead>Impact</TableHead>
          <TableHead>Area</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Detected</TableHead>
          <TableHead className="w-24" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="min-w-0">
              <div className="grid min-w-0 gap-0.5">
                <span className={textRole('bodyStrong', 'truncate')} title={row.title}>
                  {row.title}
                </span>
                {row.target_label ? (
                  <span className="text-muted truncate text-xs" title={row.target_label}>
                    {row.target_label}
                  </span>
                ) : null}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="status" value={severityBadgeValue(row.severity)}>
                {severityLabel(row.severity)}
              </Badge>
            </TableCell>
            <TableCell>
              <OpportunityTypeBadge type={row.opportunity_type} />
            </TableCell>
            <TableCell>
              <StatusControl row={row} projectId={projectId} />
            </TableCell>
            <TableCell>
              <span className="text-secondary text-xs whitespace-nowrap">
                {formatAudited(row.created_at)}
              </span>
            </TableCell>
            <TableCell>
              <Button variant="ghost" size="sm" onClick={() => onOpen(row.id)}>
                Review
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
