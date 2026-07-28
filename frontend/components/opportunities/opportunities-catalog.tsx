'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CursorPager } from '@/components/ui/cursor-pager';
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownRadioGroup,
  DropdownRadioItem,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { AccentEyebrow } from '@/components/ui/eyebrow';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  EvidenceDrawer,
  OpportunityStatusBadge,
  OpportunityTypeBadge,
} from '@/components/opportunities/evidence-drawer';
import { OPPORTUNITY_STATUS_META } from '@/components/opportunities/opportunity-status-meta';
import { useUpdateOpportunityStatus } from '@/components/opportunities/use-opportunity-status';
import { opportunitiesQueries, type OpportunitiesParams } from '@/lib/api/opportunities';
import type {
  Opportunity,
  OpportunityDetail,
  OpportunitySeverity,
  OpportunityStatus,
  OpportunityType,
} from '@/lib/api/types';
import { severityBadgeValue, severityLabel } from '@/lib/site-health/issues';
import { formatAudited } from '@/lib/site-health/status';
import { useCursorStack } from '@/lib/site-health/use-cursor-stack';

const PAGE_LIMIT = 25;

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

function FilterMenu<T extends string>({
  label,
  value,
  options,
  onChange,
}: Readonly<{
  label: string;
  value: T;
  options: ReadonlyArray<{ key: T; label: string }>;
  onChange: (value: T) => void;
}>) {
  const selectedLabel = options.find((option) => option.key === value)?.label ?? value;
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={`${label}: ${selectedLabel}`}>
          <span className="text-muted">{label}</span>
          <span>{selectedLabel}</span>
          <ChevronDown className="size-4" aria-hidden />
        </Button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>{label}</DropdownLabel>
        <DropdownRadioGroup value={value} onValueChange={(nextValue) => onChange(nextValue as T)}>
          {options.map((option) => (
            <DropdownRadioItem key={option.key} value={option.key}>
              {option.label}
            </DropdownRadioItem>
          ))}
        </DropdownRadioGroup>
      </DropdownContent>
    </Dropdown>
  );
}

function humanize(value: string): string {
  const words = value.replaceAll(/[-_]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** User-facing context only; never fall back to deterministic target keys. */
function targetLine(row: Opportunity): string | null {
  if (row.target_url) {
    try {
      const url = new URL(row.target_url);
      return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`;
    } catch {
      return row.target_url;
    }
  }
  if (row.target_theme) return `${humanize(row.target_theme)} theme`;
  return null;
}

function FeaturedRecommendation({
  detail,
  onOpen,
}: Readonly<{ detail: OpportunityDetail; onOpen: () => void }>) {
  const target = targetLine(detail);
  return (
    <Card className="border-accent-border">
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-2">
            <AccentEyebrow>Next best action</AccentEyebrow>
            <h2 className="text-foreground text-xl">{detail.title}</h2>
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
        <p className="text-secondary max-w-3xl text-sm whitespace-pre-line">{detail.remediation}</p>
        {target ? <p className="text-muted text-xs">Applies to {target}</p> : null}
      </CardContent>
    </Card>
  );
}

/** Per-row status control (dropdown → updateStatus mutation). */
function StatusControl({ row, projectId }: Readonly<{ row: Opportunity; projectId: string }>) {
  const updateStatus = useUpdateOpportunityStatus(projectId, row.id);
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          type="button"
          aria-label={`Change status for ${row.title}`}
          className="focus-ring rounded-full"
          // Row click opens the drawer — the status control must not.
          onClick={(event) => event.stopPropagation()}
        >
          <OpportunityStatusBadge status={row.status} />
        </button>
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
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pager = useCursorStack();

  const params: OpportunitiesParams = useMemo(
    () => ({
      type: typeFilter === 'all' ? undefined : typeFilter,
      severity: severityFilter === 'all' ? undefined : severityFilter,
      status: statusFilter === 'active' ? undefined : statusFilter,
      cursor: pager.cursor,
      limit: PAGE_LIMIT,
    }),
    [typeFilter, severityFilter, statusFilter, pager.cursor],
  );

  const listQuery = useQuery(opportunitiesQueries.list(projectId, params));
  const rows = listQuery.data?.items ?? [];
  const nextCursor = listQuery.data?.next_cursor ?? null;
  const featuredId =
    statusFilter === 'active' && pager.cursor === null ? (rows[0]?.id ?? null) : null;
  const featuredQuery = useQuery({
    ...opportunitiesQueries.detail(featuredId ?? ''),
    enabled: featuredId !== null,
  });
  const featured = featuredQuery.data;

  return (
    <div className="grid gap-6">
      {featuredQuery.isLoading && featuredId ? (
        <Skeleton className="h-44 w-full" />
      ) : featured ? (
        <FeaturedRecommendation detail={featured} onOpen={() => setSelectedId(featured.id)} />
      ) : null}

      <section className="grid gap-3" aria-labelledby="recommendations-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1">
            <h2 id="recommendations-heading" className="text-foreground text-lg">
              Prioritized recommendations
            </h2>
            <p className="text-muted text-xs">
              Ordered by expected impact using your latest visibility and site evidence.
            </p>
          </div>
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Recommendation filters"
          >
            <FilterMenu
              label="Area"
              value={typeFilter}
              options={TYPE_FILTERS}
              onChange={(value) => {
                setTypeFilter(value);
                pager.reset();
              }}
            />
            <FilterMenu
              label="Impact"
              value={severityFilter}
              options={SEVERITY_FILTERS}
              onChange={(value) => {
                setSeverityFilter(value);
                pager.reset();
              }}
            />
            <FilterMenu
              label="Status"
              value={statusFilter}
              options={STATUS_FILTERS}
              onChange={(value) => {
                setStatusFilter(value);
                pager.reset();
              }}
            />
          </div>
        </div>

        {listQuery.isError ? (
          <Alert tone="danger">Could not load opportunities. Please refresh.</Alert>
        ) : listQuery.isLoading ? (
          <div className="grid gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="text-secondary text-sm">
              No recommendations match these filters. Try broadening the area, impact, or status.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recommendation</TableHead>
                  <TableHead>Impact</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detected</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} className="hover:bg-background-alt">
                    <TableCell>
                      <div className="grid gap-0.5">
                        <span className="text-foreground text-sm font-medium">{row.title}</span>
                        {targetLine(row) ? (
                          <span className="text-2xs text-muted break-all">{targetLine(row)}</span>
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedId(row.id);
                        }}
                      >
                        Review
                        <ChevronRight className="size-4" aria-hidden />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {rows.length > 0 ? (
          <div className="flex items-center justify-end gap-2">
            <CursorPager
              canPrev={pager.canPrev}
              canNext={Boolean(nextCursor)}
              onPrev={pager.pop}
              onNext={() => pager.push(nextCursor)}
            />
          </div>
        ) : null}
      </section>

      <EvidenceDrawer
        opportunityId={selectedId}
        projectId={projectId}
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </div>
  );
}
