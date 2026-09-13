'use client';

import { ProjectLink } from '@/components/layout/scoped-link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { Drawer } from '@/components/ui/drawer';
import { ScoreBar } from '@/components/ui/score-bar';
import { UnavailableValue } from '@/components/ui/unavailable-value';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRecordMetricCell,
  TableRow,
} from '@/components/ui/table';
import { siteHealthQueries } from '@/lib/api/site-health';
import type { ReadinessCheck, ReadinessDimension } from '@/lib/api/types';
import { formatScore, PLACEHOLDER } from '@/lib/site-health/status';
import {
  contentHandoffHref,
  remediationRoute,
  type RemediationRoute,
} from '@/lib/site-health/remediation';
import { textRole } from '@/components/ui/typography';
import { Stack } from '@/components/ui/layout';
import { ledgerClasses } from '@/components/ui/workspace';

function pageLabel(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function formatCoverage(coverage: number | null): string {
  return coverage === null ? PLACEHOLDER : `${Math.round(coverage * 100)}%`;
}

type DimensionState =
  | 'Critical'
  | 'Needs work'
  | 'Nearly there'
  | 'Passing'
  | 'Not measured'
  | 'Not applicable'
  | 'Excluded';

/**
 * Say how the pillar SCORED, not whether any single check failed.
 *
 * The old rule flipped a pillar to red "Needs work" on one missing check
 * anywhere in the crawl, which put a 98-scoring Structure pillar in the same
 * state as a 0-scoring Evidence one and gave the reader nothing to prioritise
 * by. Bands come off the score the table already shows, so the badge and the
 * number can never contradict each other.
 */
function dimensionState(dimension: ReadinessDimension): DimensionState {
  if (dimension.dimension_applicability === 'not_applicable') return 'Not applicable';
  if (dimension.dimension_measurement_state === 'excluded') return 'Excluded';
  if (dimension.score === null) return 'Not measured';
  // Band the DISPLAYED score, not the raw one. The Score column rounds through
  // `formatScore`, so comparing the unrounded value put a row reading "100"
  // next to a "Nearly there" badge and a row reading "50" next to "Critical" —
  // the exact contradiction this function exists to prevent.
  const score = Math.round(dimension.score);
  if (score < 50) return 'Critical';
  if (score < 80) return 'Needs work';
  // A perfect score over an INCOMPLETE set is not a pass. Unresolved checks
  // cap the badge one band below, so "Passing" only ever means every
  // applicable check resolved and every one of them passed.
  const unresolved =
    dimension.dimension_measurement_state !== 'measured' ||
    dimension.unresolved_count > 0 ||
    dimension.unknown_count > 0 ||
    dimension.error_count > 0 ||
    dimension.partial_count > 0;
  if (dimension.score < 100 || unresolved) return 'Nearly there';
  return 'Passing';
}

function stateBadgeValue(state: DimensionState) {
  if (state === 'Critical') return 'danger' as const;
  if (state === 'Needs work') return 'warning' as const;
  if (state === 'Nearly there') return 'warning' as const;
  if (state === 'Passing') return 'success' as const;
  return 'info' as const;
}

export function AeoReadinessPanel({
  projectId,
  crawlId,
}: Readonly<{
  projectId: string;
  crawlId: string;
}>) {
  const readiness = useQuery(siteHealthQueries.aeoReadiness(projectId, crawlId));
  const [detailKey, setDetailKey] = useState<string | null>(null);

  if (readiness.isLoading) {
    return (
      <output className="text-secondary block text-sm">Loading persisted AEO evaluations…</output>
    );
  }
  if (readiness.isError) return <Alert tone="danger">Could not load AEO Readiness.</Alert>;
  if (!readiness.data || readiness.data.crawl_id === null) {
    return (
      <Alert tone="info">
        {readiness.data?.limitations[0] ??
          'AEO Readiness appears once a crawl has finished analyzing pages.'}
      </Alert>
    );
  }

  const data = readiness.data;
  const selected = data.dimensions.find((dimension) => dimension.key === detailKey) ?? null;
  return (
    <div className="grid min-w-0 gap-4" data-testid="aeo-readiness">
      {data.limitations.length > 0 ? <Alert tone="info">{data.limitations.join(' ')}</Alert> : null}
      <ReadinessLedger dimensions={data.dimensions} onOpen={setDetailKey} />
      <DimensionDrawer
        dimension={selected}
        crawlId={crawlId}
        projectId={projectId}
        onClose={() => setDetailKey(null)}
      />
    </div>
  );
}

function ReadinessLedger({
  dimensions,
  onOpen,
}: Readonly<{ dimensions: ReadinessDimension[]; onOpen: (key: string) => void }>) {
  return (
    <Card>
      <CardHeader bordered className="gap-1">
        <CardTitle className="text-lg">Readiness dimensions</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table className="block md:table" wrapperClassName="overflow-hidden md:overflow-auto">
          <TableHeader className="hidden md:table-header-group">
            <TableRow>
              <TableHead>Dimension</TableHead>
              <TableHead numeric>Score</TableHead>
              <TableHead>Quality</TableHead>
              <TableHead numeric>Coverage</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody className="block md:table-row-group">
            {dimensions.map((dimension) => {
              const state = dimensionState(dimension);
              return (
                <TableRow
                  key={dimension.key}
                  className="grid h-auto grid-cols-1 py-2 md:table-row md:h-[var(--table-row-height)] md:py-0"
                >
                  <TableCell className="block min-w-0 border-b-0 px-4 py-2 md:table-cell md:min-w-64 md:border-b md:px-[var(--table-cell-padding-x)] md:py-[var(--table-cell-padding-y)]">
                    <Stack gap="tight">
                      <span className={textRole('emphasis')}>{dimension.label}</span>
                      <span className="text-muted text-xs">{dimension.description}</span>
                    </Stack>
                  </TableCell>
                  <TableRecordMetricCell label="Score">
                    {formatScore(dimension.score)}
                  </TableRecordMetricCell>
                  <TableRecordMetricCell label="Quality" className="md:min-w-32">
                    {dimension.score === null ? (
                      dimension.dimension_measurement_state === 'not_measured' ? (
                        <UnavailableValue state="not_measured" />
                      ) : (
                        <span className="text-muted text-xs">{state}</span>
                      )
                    ) : (
                      <ScoreBar value={dimension.score} label={`${dimension.label} score`} />
                    )}
                  </TableRecordMetricCell>
                  <TableRecordMetricCell label="Coverage">
                    {dimension.coverage === null ? (
                      <UnavailableValue state="not_measured" />
                    ) : (
                      formatCoverage(dimension.coverage)
                    )}
                  </TableRecordMetricCell>
                  <TableRecordMetricCell label="State" className="items-center">
                    <Badge variant="status" value={stateBadgeValue(state)}>
                      {state}
                    </Badge>
                  </TableRecordMetricCell>
                  <TableCell className="block px-4 pt-2 pb-3 md:table-cell md:px-[var(--table-cell-padding-x)] md:py-[var(--table-cell-padding-y)]">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full md:w-auto"
                      onClick={() => onOpen(dimension.key)}
                    >
                      View details <span className="sr-only">for {dimension.label}</span>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DimensionDrawer({
  dimension,
  crawlId,
  projectId,
  onClose,
}: Readonly<{
  dimension: ReadinessDimension | null;
  crawlId: string;
  projectId: string;
  onClose: () => void;
}>) {
  return (
    <Drawer
      open={Boolean(dimension)}
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={dimension ? `${dimension.label} evidence` : ''}
      description={dimension?.description ?? ''}
      closeLabel="Close evidence"
    >
      {dimension ? (
        <div className="grid gap-[var(--workspace-gap)]">
          <CheckLedger checks={dimension.checks} />
          <FailingPages dimension={dimension} crawlId={crawlId} projectId={projectId} />
        </div>
      ) : null}
    </Drawer>
  );
}

function CheckLedger({ checks }: Readonly<{ checks: ReadinessCheck[] }>) {
  return (
    <section className="grid gap-2">
      <h3 className={textRole('objectTitle')}>Checks</h3>
      {checks.length === 0 ? (
        <p className={textRole('body')}>No determinate checks were recorded.</p>
      ) : (
        <ul className={ledgerClasses()}>
          {checks.map((check) => (
            <CheckRow key={check.rule_id} check={check} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CheckRow({ check }: Readonly<{ check: ReadinessCheck }>) {
  const state = checkState(check);
  return (
    <li className="grid gap-1 py-3 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={textRole('bodyStrong')}>{check.title}</span>
        <span className="text-secondary text-xs">{state}</span>
      </div>
      <p className={textRole('body')}>
        {check.remediation || 'No remediation guidance is recorded for this check.'}
      </p>
      <p className="text-muted text-xs tabular-nums">
        {check.satisfied_count} satisfied · {check.partial_count} partial · {check.missing_count}{' '}
        missing · {check.unknown_count} unknown
      </p>
    </li>
  );
}

function checkState(check: ReadinessCheck) {
  if (check.error_count > 0 || check.unknown_count > 0) return 'Incomplete';
  if (check.missing_count > 0 || check.partial_count > 0) return 'Needs work';
  if (check.satisfied_count > 0) return 'Passing';
  if (check.not_applicable_count > 0) return 'Did not apply';
  return 'Not measured';
}

function FailingPages({
  dimension,
  crawlId,
  projectId,
}: Readonly<{ dimension: ReadinessDimension; crawlId: string; projectId: string }>) {
  const shown = dimension.evidence_pages.length;
  const total = dimension.failing_page_count;
  return (
    <section className="grid gap-2">
      <div className="grid gap-0.5">
        <h3 className={textRole('objectTitle')}>Pages to fix</h3>
        <p className="text-muted text-xs">
          {total === 0
            ? 'No failing pages were recorded.'
            : shown < total
              ? `Showing the ${shown} most affected of ${total} pages, worst first.`
              : `${total} page${total === 1 ? '' : 's'} failed at least one check, worst first.`}
        </p>
      </div>
      <ul className={ledgerClasses()}>
        {dimension.evidence_pages.map((page) => (
          <li key={page.site_url_id} className="grid gap-1.5 py-3 first:pt-0">
            <ProjectLink
              className={textRole('bodyStrong', 'text-accent-text truncate hover:underline')}
              href={`/site/crawls/${crawlId}/pages/${page.site_url_id}`}
            >
              {pageLabel(page.normalized_url)}
            </ProjectLink>
            <ul className="grid gap-1">
              {page.failed_checks.map((check) => (
                <li key={check.rule_id} className="text-secondary flex items-start gap-2 text-xs">
                  <span className="bg-danger mt-1.5 size-1.5 shrink-0 rounded-full" aria-hidden />
                  <span>
                    {check.title}: {check.expected_capability}
                  </span>
                </li>
              ))}
            </ul>
            <PageActions
              projectId={projectId}
              crawlId={crawlId}
              page={page}
              dimensionLabel={dimension.label}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The next action for one failing page, whatever kind of failure it is.
 *
 * Previously a single "Improve in Content" button appeared whenever any failed
 * check carried the catalog's `content_addressable` flag, and it sent EVERY
 * flagged rule id in the pillar to an endpoint that accepts only title and
 * meta-description gaps — so every button 404'd. The backend now routes each
 * check, the Content link carries only what Content can write, and everything
 * else gets the prompt.
 */
function PageActions({
  projectId,
  crawlId,
  page,
  dimensionLabel,
}: Readonly<{
  projectId: string;
  crawlId: string;
  page: ReadinessDimension['evidence_pages'][number];
  dimensionLabel: string;
}>) {
  // The SERVER routes every check, from the same catalog the hand-off endpoint
  // authorizes against — so the panel cannot offer a draft that 404s, and the
  // three buckets partition the failed checks with nothing falling through.
  const byRoute = (route: RemediationRoute) =>
    page.failed_checks.filter((check) => remediationRoute(check.remediation_route) === route);
  const contentChecks = byRoute('content');
  const href = contentHandoffHref({
    projectId,
    crawlId,
    siteUrlId: page.site_url_id,
    ruleIds: contentChecks.map((check) => check.rule_id),
  });
  // Everything Content cannot write gets the prompt instead. There is no
  // per-row Growth Agent launcher here: the screen already has ONE agent entry
  // point, and repeating it on every failing page turned a considered action
  // into chrome. It also fires from inside this open drawer into a second
  // modal drawer, which was never verified to work.
  const promptChecks = page.failed_checks.filter(
    (check) => remediationRoute(check.remediation_route) !== 'content',
  );
  return (
    <div className="flex flex-wrap items-center gap-3">
      {href ? (
        <Button asChild size="sm" className="justify-self-start">
          <ProjectLink href={href}>Improve with Content</ProjectLink>
        </Button>
      ) : null}
      {promptChecks.length > 0 ? (
        <CopyButton
          value={fixPrompt(dimensionLabel, page.normalized_url, promptChecks)}
          size="sm"
          variant="secondary"
        >
          Copy fix prompt
        </CopyButton>
      ) : null}
    </div>
  );
}

/** The failing checks for one page, in a form a developer or agent can act on. */
function fixPrompt(
  dimensionLabel: string,
  url: string,
  checks: ReadinessDimension['evidence_pages'][number]['failed_checks'],
): string {
  const lines = checks.map((check) => `- ${check.title}: ${check.remediation}`);
  return [`Improve ${dimensionLabel} on ${url}.`, '', 'Failing checks:', ...lines].join('\n');
}
