'use client';

import { Info, Inbox, RefreshCw, SearchX } from 'lucide-react';

import { ProjectLink } from '@/components/layout/scoped-link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardEyebrow, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { IconChip } from '@/components/ui/icon-chip';
import { textRole } from '@/components/ui/typography';
import { ICONS } from '@/lib/icons';

/**
 * Shared data-state presentations for the two evidence tabs (design.md states
 * gallery): loading skeleton, retryable error, empty (no executions yet),
 * filtered-empty, and the truncation notice. Both `answer-evidence.tsx` and
 * `fanout-evidence.tsx` reuse these so their states stay consistent.
 */

import type { UseQueryResult } from '@tanstack/react-query';

import type { VisibilityEvidenceResponse } from '@/lib/api/types';

/** Props shared by the surfaces that render execution evidence. */
export type EvidenceTabProps = Readonly<{
  query: UseQueryResult<VisibilityEvidenceResponse, unknown>;
  isFiltered: boolean;
  onClearFilters?: () => void;
  limit: number;
}>;

export function EvidenceSkeleton({ title }: Readonly<{ title: string }>) {
  return (
    <Card aria-hidden>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Skeleton className="h-24 w-full" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-12" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function EvidenceError({
  title,
  onRetry,
}: Readonly<{ title: string; onRetry: () => void }>) {
  return (
    <Card>
      <CardContent>
        <div className="grid gap-3 py-[var(--empty-state-padding)]">
          <CardEyebrow>{title}</CardEyebrow>
          <IconChip className="bg-danger-bg text-danger-text">
            <ICONS.warning className="size-5" aria-hidden />
          </IconChip>
          <h3 className={textRole('sectionTitle')}>Couldn&apos;t load this evidence</h3>
          <p className="text-secondary max-w-xs text-sm">
            The request failed or timed out. Your filters are unchanged.
          </p>
          <Button variant="primary" size="sm" onClick={onRetry}>
            <RefreshCw className="size-4" aria-hidden />
            Retry
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function EvidenceEmpty({
  title,
  heading,
  body,
}: Readonly<{ title: string; heading: string; body: string }>) {
  return (
    <Card>
      <CardContent>
        <div className="grid gap-3 py-[var(--empty-state-padding)]">
          <CardEyebrow>{title}</CardEyebrow>
          <IconChip className="bg-neutral-bg text-muted">
            <Inbox className="size-5" aria-hidden />
          </IconChip>
          <h3 className={textRole('sectionTitle')}>{heading}</h3>
          <p className="text-secondary max-w-sm text-sm">{body}</p>
          <Button asChild variant="ghost" size="sm">
            <ProjectLink href="/runs">View Runs</ProjectLink>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function EvidenceFilteredEmpty({
  title,
  body,
  onClear,
}: Readonly<{ title: string; body: string; onClear?: () => void }>) {
  return (
    <Card>
      <CardContent>
        <div className="grid gap-3 py-[var(--empty-state-padding)]">
          <CardEyebrow>{title}</CardEyebrow>
          <IconChip className="bg-neutral-bg text-muted">
            <SearchX className="size-5" aria-hidden />
          </IconChip>
          <h3 className={textRole('sectionTitle')}>No results match these filters</h3>
          <p className="text-secondary max-w-sm text-sm">{body}</p>
          {onClear ? (
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function TruncationNotice({ limit }: Readonly<{ limit: number }>) {
  return (
    <div className="border-border-subtle text-muted flex items-center gap-2 border-t px-4 py-2 text-xs">
      <Info className="size-4 shrink-0" aria-hidden />
      <span>Showing newest {limit} executions; refine filters to narrow results.</span>
    </div>
  );
}
