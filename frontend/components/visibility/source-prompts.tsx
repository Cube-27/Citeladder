'use client';

import { useQuery } from '@tanstack/react-query';

import { Alert } from '@/components/ui/alert';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import { ProjectLink } from '@/components/layout/scoped-link';
import { BusyBar } from '@/components/ui/busy-bar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { textRole } from '@/components/ui/typography';
import { MissingValue } from '@/components/ui/unavailable-value';
import { TruncationNotice } from '@/components/visibility/evidence-states';
import { queryKeys } from '@/lib/api/query-keys';
import type { VisibilityExecutionEvidence } from '@/lib/api/types';
import { visibilityApi } from '@/lib/api/visibility';
import { engineLabel } from '@/lib/providers/catalog';
import type { SourceFilters } from '@/components/visibility/source-rows';
import { count, hostOf, sinceLabel } from '@/lib/visibility/sources';
import type { SourceQueries } from '@/lib/visibility/use-source-analysis';
import { EVIDENCE_LIMIT } from '@/lib/visibility/use-visibility-dashboard';

/** A counted nought in a column of chips, kept apart from an absent one. */
function ObservedNone() {
  return <span className={textRole('meta', 'text-secondary tabular-nums')}>0</span>;
}

/** Chips a cell carries before it stops being a cell; the rest become "+N". */
const MAX_CHIPS = 3;

/**
 * The tracked answers that used this source, one row each.
 *
 * A TABLE, not an evidence feed. A reader on a domain's page is scanning for
 * which prompts reached it and how heavily — a question answered by rows they
 * can compare down a column. The full answer text, its mentions and its
 * citation list belong to the answer itself, which is one click away on Query
 * fanouts; reproducing them here made every row tall enough that comparing two
 * meant scrolling between them.
 *
 * Reads `/visibility/evidence` narrowed by domain or URL rather than adding a
 * third place that assembles an answer list.
 */
export function SourcePrompts({
  filters,
  queries,
  domain,
  url,
}: Readonly<{
  filters: SourceFilters;
  queries: SourceQueries;
  domain?: string | null;
  url?: string | null;
}>) {
  const params = {
    audit_id: queries.selectedRunIds ? undefined : (queries.activeRunId ?? undefined),
    audit_ids: queries.selectedRunIds,
    engine: filters.engine === 'all' ? undefined : filters.engine,
    cohort: filters.cohort,
    domain: domain ?? undefined,
    url: url ?? undefined,
  };
  const query = useQuery({
    queryKey: queryKeys.visibility.evidence(queries.projectId ?? '', params),
    queryFn: ({ signal }) =>
      visibilityApi.getVisibilityEvidence(queries.projectId!, params, {
        signal,
        workspaceId: queries.workspaceId,
      }),
    enabled: Boolean(queries.projectId && queries.activeRunId && (domain || url)),
  });

  return (
    <Card className="relative" aria-busy={query.isFetching}>
      <BusyBar active={query.isFetching} label="Updating prompts" />
      <CardHeader>
        <CardTitle>Prompts</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <PromptsBody
          items={query.data?.items ?? []}
          loading={query.isLoading}
          errored={query.isError}
        />
        {/* The endpoint returns a bounded newest-first window. Without this a
            source cited by more answers than fit simply looked like it had
            fewer. */}
        {query.data?.truncated ? <TruncationNotice limit={EVIDENCE_LIMIT} /> : null}
      </CardContent>
    </Card>
  );
}

function PromptsBody({
  items,
  loading,
  errored,
}: Readonly<{
  items: readonly VisibilityExecutionEvidence[];
  loading: boolean;
  errored: boolean;
}>) {
  if (errored) return <Alert tone="danger">Could not load the tracked answers.</Alert>;
  if (loading) return <Skeleton className="m-[var(--card-padding)] h-40" />;
  if (items.length === 0) {
    return (
      <p className={textRole('body', 'text-secondary p-[var(--card-padding)]')}>
        No tracked answers in this selection used this source.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Prompt</TableHead>
          <TableHead numeric>Citations</TableHead>
          <TableHead className="hidden md:table-cell">Mentioned</TableHead>
          <TableHead className="hidden lg:table-cell">Sources</TableHead>
          <TableHead numeric className="hidden sm:table-cell">
            Created
          </TableHead>
          <TableHead>
            <span className="sr-only">Open</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <PromptRow key={item.analysis_id} item={item} />
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * One answer as a row: which engine produced it, what it said, what it cited.
 *
 * The engine's mark leads the row rather than sitting in a column of its own —
 * it is an identity, and a reader scanning for "what did Gemini say" finds a
 * logo faster than a word.
 */
function PromptRow({ item }: Readonly<{ item: VisibilityExecutionEvidence }>) {
  return (
    <TableRow>
      <TableCell className="max-w-[34rem]">
        <span className="flex min-w-0 items-start gap-2">
          <BrandLogo
            name={engineLabel(item.logical_engine) || item.logical_engine}
            size="sm"
            className="mt-0.5"
          />
          <span className="grid min-w-0">
            <span className="truncate">{item.prompt_text || 'Untitled prompt'}</span>
            <span className={textRole('meta', 'text-secondary truncate')}>
              {item.transport_model || engineLabel(item.logical_engine) || item.logical_engine}
            </span>
          </span>
        </span>
      </TableCell>
      <TableCell numeric>{count(item.citations.length) ?? '0'}</TableCell>
      <TableCell className="hidden md:table-cell">
        <MentionChips item={item} />
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <SourceChips item={item} />
      </TableCell>
      <TableCell numeric className="hidden sm:table-cell">
        {sinceLabel(item.completed_at) ?? <MissingValue />}
      </TableCell>
      <TableCell>
        {/* The row summarises the answer; this reaches the answer itself. It
            is the one thing the old evidence feed carried that a compact row
            cannot replace with a number. */}
        <Button asChild variant="ghost" size="sm">
          <ProjectLink href={`/runs/${item.audit_id}?execution=${item.task_id}`}>
            Open answer
          </ProjectLink>
        </Button>
      </TableCell>
    </TableRow>
  );
}

/**
 * The brands this answer named, as marks.
 *
 * An empty list is an OBSERVED zero, not an absent measurement: the answer was
 * read and it named nobody. `MissingValue` would report that as "not measured",
 * which is the opposite finding -- so the cell says nought and means it.
 */
function MentionChips({ item }: Readonly<{ item: VisibilityExecutionEvidence }>) {
  const named = [...new Map(item.mentions.map((one) => [one.name, one])).values()];
  if (!named.length) return <ObservedNone />;
  return (
    <ChipRow overflow={named.length - MAX_CHIPS}>
      {named.slice(0, MAX_CHIPS).map((mention) => (
        <Tooltip key={`${mention.kind}:${mention.name}`} content={mention.name}>
          <span className="inline-flex">
            <BrandLogo name={mention.name || 'Brand'} size="xs" />
          </span>
        </Tooltip>
      ))}
    </ChipRow>
  );
}

/** The sites this answer drew on, as their favicons. An empty list is zero. */
function SourceChips({ item }: Readonly<{ item: VisibilityExecutionEvidence }>) {
  const hosts = [
    ...new Set(item.citations.map((citation) => hostOf(citation.url)).filter(Boolean)),
  ] as string[];
  if (!hosts.length) return <ObservedNone />;
  return (
    <ChipRow overflow={hosts.length - MAX_CHIPS}>
      {hosts.slice(0, MAX_CHIPS).map((host) => (
        <Tooltip key={host} content={host}>
          <span className="inline-flex">
            <BrandLogo name={host} websiteUrl={`https://${host}`} size="xs" />
          </span>
        </Tooltip>
      ))}
    </ChipRow>
  );
}

function ChipRow({
  children,
  overflow,
}: Readonly<{ children: React.ReactNode; overflow: number }>) {
  return (
    <span className="flex items-center gap-1">
      {children}
      {overflow > 0 ? (
        <span className={textRole('meta', 'text-secondary tabular-nums')}>+{overflow}</span>
      ) : null}
    </span>
  );
}
