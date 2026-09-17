'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Telescope } from 'lucide-react';
import type { z } from 'zod';

import { Badge } from '@/components/ui/badge';
import { BusyBar } from '@/components/ui/busy-bar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Stack } from '@/components/ui/layout';
import { Limitations } from '@/components/ui/passage';
import { ReadError } from '@/components/ui/read-error';
import { Skeleton } from '@/components/ui/skeleton';
import { textRole } from '@/components/ui/typography';
import { MetricGroup, MetricItem, ledgerClasses } from '@/components/ui/workspace';
import { CompetitorGapRow } from '@/components/visibility/competitor-gap-row';
import { SourcePageDrawer } from '@/components/visibility/source-page-drawer';
import type {
  competitorAnalysisSchema,
  sourceClassGroupSchema,
} from '@/lib/api/schemas/source-pages';
import { sourcePagesQueries } from '@/lib/api/source-pages';
import { coverageLabel } from '@/lib/visibility/source-pages';
import { sourceCategoryLabels } from '@/lib/visibility/vocabulary';

type Analysis = z.infer<typeof competitorAnalysisSchema>;
type Group = z.infer<typeof sourceClassGroupSchema>;

/**
 * Where competitors are cited and the brand is not, by kind of source.
 *
 * The question this tab exists for is answered on arrival, with no drill-down:
 * source classes are the axis, and each one carries the pages where a rival is
 * on the page and the brand is not — the competitor names, the quoted line
 * proving each, the page format, how many answers cited it, and the action.
 *
 * Project-scoped rather than run-scoped. Inspection is a property of the page,
 * not of the audit that happened to cite it, so this view does not change when
 * a reader picks a different run and the run controls are hidden for it.
 *
 * A page nobody has inspected is COUNTED and never listed as a gap. "Nobody
 * looked" and "you are not there" are different sentences, and collapsing them
 * is the defect this whole feature removes.
 */
export function CompetitorAnalysis({
  projectId,
  workspaceId,
}: Readonly<{ projectId: string | null; workspaceId: string | null }>) {
  const [openHash, setOpenHash] = useState<string | null>(null);
  const query = useQuery({
    ...sourcePagesQueries.competitorAnalysis(workspaceId ?? '', projectId ?? ''),
    enabled: Boolean(projectId && workspaceId),
  });

  if (query.isError) {
    return (
      <ReadError
        error={query.error}
        fallback="Could not load the cited pages for this project."
        onRetry={() => void query.refetch()}
        pending={query.isFetching}
      />
    );
  }
  if (query.isLoading || !query.data) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  return (
    <>
      <Loaded data={query.data} busy={query.isFetching} onOpenPage={setOpenHash} />
      <SourcePageDrawer
        projectId={projectId}
        workspaceId={workspaceId}
        urlHash={openHash}
        onClose={() => setOpenHash(null)}
      />
    </>
  );
}

function Loaded({
  data,
  busy,
  onOpenPage,
}: Readonly<{ data: Analysis; busy: boolean; onOpenPage: (hash: string) => void }>) {
  if (data.pages_total === 0) {
    return (
      <EmptyState
        icon={Telescope}
        heading="No cited pages yet"
        description="Once a run completes, the external pages the models cited are inspected and appear here."
      />
    );
  }
  return (
    <Stack gap="workspace">
      <Summary data={data} busy={busy} />
      {data.groups.map((group) => (
        <SourceClassCard key={group.source_class} group={group} onOpenPage={onOpenPage} />
      ))}
    </Stack>
  );
}

/** The claim, the coverage behind it, and what it may not be read as. */
function Summary({ data, busy }: Readonly<{ data: Analysis; busy: boolean }>) {
  return (
    <div
      className="bg-surface border-border-subtle relative grid gap-4 rounded-[var(--radius-card)] border p-[var(--card-padding)] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
      aria-busy={busy}
    >
      <BusyBar active={busy} label="Updating cited pages" />
      <div className="grid gap-1">
        <p className={textRole('objectTitle')}>{headline(data)}</p>
        <p className={textRole('meta')}>
          Competitors found on the page itself, each with the line that proves it.
        </p>
      </div>
      <MetricGroup className="lg:w-auto">
        <MetricItem label="Pages with a gap" value={String(data.gap_pages)} />
        <MetricItem
          label="Pages inspected"
          value={String(data.pages_inspected)}
          detail={`of ${data.pages_total} cited`}
        />
        <MetricItem label="Not inspected" value={String(data.pages_not_inspected)} />
      </MetricGroup>
      <Limitations items={data.limitations} className="lg:col-span-2" />
    </div>
  );
}

function headline(data: Analysis): string {
  if (data.gap_pages === 0) {
    return data.pages_inspected === 0
      ? 'None of the cited pages have been inspected yet.'
      : 'No inspected page has a competitor on it without you.';
  }
  const pages = `${data.gap_pages} cited ${data.gap_pages === 1 ? 'page' : 'pages'}`;
  return `Competitors appear on ${pages} where you do not.`;
}

/** One kind of source: editorial, review marketplace, community, social. */
function SourceClassCard({
  group,
  onOpenPage,
}: Readonly<{ group: Group; onOpenPage: (hash: string) => void }>) {
  // An unmapped class renders as nothing rather than leaking its token, so the
  // raw value is the last resort and not the first.
  const label = sourceCategoryLabels([group.source_class])[0] ?? 'Other sources';
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-baseline justify-between gap-3">
        <div className="grid gap-1">
          <CardTitle>{label}</CardTitle>
          <p className={textRole('meta')}>{groupSummary(group)}</p>
        </div>
        <Badge variant="neutral">{coverageLabel(group.pages_inspected, group.pages_total)}</Badge>
      </CardHeader>
      <CardContent className="p-0">
        {group.pages.length ? (
          <ul className={ledgerClasses()}>
            {group.pages.map((page) => (
              <CompetitorGapRow key={page.url_hash} page={page} onOpenPage={onOpenPage} />
            ))}
          </ul>
        ) : (
          <p className={textRole('body', 'p-[var(--card-padding)]')}>{groupEmpty(group)}</p>
        )}
        {group.truncated ? (
          <p className="text-muted px-[var(--card-padding)] pb-[var(--card-padding)] text-xs">
            Showing the {group.pages.length} pages with the most competitors on them, of{' '}
            {group.gap_pages}.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function groupSummary(group: Group): string {
  const parts = [
    `${group.gap_pages} ${group.gap_pages === 1 ? 'page' : 'pages'} where a competitor appears and you do not`,
  ];
  if (group.pages_not_inspected > 0) {
    parts.push(`${group.pages_not_inspected} not inspected`);
  }
  if (group.pages_blocked > 0) {
    parts.push(`${group.pages_blocked} blocked by the publisher`);
  }
  return parts.join(' · ');
}

/**
 * What an empty group means — which is not always the same thing.
 *
 * With nothing inspected there is no finding at all; with pages inspected and
 * no gap, the finding is that there is no gap. Reporting the first as the
 * second is how an unread page becomes a clean bill of health.
 */
function groupEmpty(group: Group): string {
  if (group.pages_inspected === 0) {
    return `None of these ${group.pages_total} cited pages have been inspected, so who appears on them is unknown.`;
  }
  return `No competitor appears without you across the ${group.pages_inspected} inspected ${
    group.pages_inspected === 1 ? 'page' : 'pages'
  } here.`;
}
