import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { StatusMark, type StatusTone } from '@/components/ui/status-mark';
import { CopyButton } from '@/components/ui/copy-button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Drawer } from '@/components/ui/drawer';
import { Dot } from '@/components/ui/icon';
import { Inline, Stack } from '@/components/ui/layout';
import { Pressable } from '@/components/ui/pressable';
import { TextLink } from '@/components/ui/text-link';
import { Absence } from '@/components/ui/absence';
import { ClampText } from '@/components/ui/clamp-text';
import { TableCell, TableRow } from '@/components/ui/table';
import { siteHealthQueries } from '@/lib/api/site-health-queries';
import type { ReadinessCheck, ReadinessDimension } from '@citeladder/contracts';
import { scoreBand } from '@/lib/score-band';
import { formatScore } from '@/lib/site-health/status';
import { textRole } from '@/components/ui/typography';
import {
  EditorialSectionHeader,
  ledgerClasses,
  ledgerItemClasses,
} from '@/components/ui/workspace';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import { formatCount, formatPercent, pluralCount } from '@/lib/format';

function pageLabel(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}

type DimensionState =
  | 'Critical'
  | 'Needs work'
  | 'Nearly there'
  | 'Passing'
  | 'No score'
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
  if (dimension.score === null) return 'No score';
  // Round prioritization bands for display. Passing below still requires an
  // actual perfect score over a complete measurement.
  const band = scoreBand(Math.round(dimension.score));
  if (band === 'low') return 'Critical';
  if (band === 'mid') return 'Needs work';
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

/**
 * Why a pillar that prints 100 is still "Nearly there". The band drops a step
 * while a check is unresolved; without the reason the word and the number
 * contradict each other. Below a printed 100 the number is the reason.
 */
function bandReason(dimension: ReadinessDimension): string | null {
  if (dimension.score === null || Math.round(dimension.score) < 100) return null;
  if (dimensionState(dimension) !== 'Nearly there') return null;
  if (dimension.unresolved_count > 0) {
    return `${pluralCount(dimension.unresolved_count, 'check')} unresolved`;
  }
  const incomplete = dimension.checks.filter(
    (check) => check.error_count > 0 || check.unknown_count > 0,
  ).length;
  if (incomplete > 0) return `${pluralCount(incomplete, 'check')} incomplete`;
  const partial = dimension.checks.filter(
    (check) => check.partial_count > 0 || check.missing_count > 0,
  ).length;
  if (partial > 0) return `${pluralCount(partial, 'check')} not fully met`;
  if (dimension.dimension_measurement_state === 'limited_evidence') return 'Limited evidence';
  return 'Not every check resolved';
}

/**
 * Each band its own tone, so "Nearly there" never reads as "Needs work". A
 * pillar with no score has no band: it takes the neutral badge.
 */
const DIMENSION_TONES: Record<DimensionState, StatusTone> = {
  Critical: 'negative',
  'Needs work': 'warning',
  'Nearly there': 'info',
  Passing: 'positive',
  'No score': 'neutral',
  'Not applicable': 'neutral',
  Excluded: 'neutral',
};

type CheckState = 'Incomplete' | 'Needs work' | 'Passing' | 'Did not apply' | 'Not checked';

/** A check's state in the same tones as the pillar bands it rolls up into. */
const CHECK_TONES: Record<CheckState, StatusTone> = {
  Incomplete: 'info',
  'Needs work': 'warning',
  Passing: 'positive',
  'Did not apply': 'neutral',
  'Not checked': 'neutral',
};

export function AeoReadinessPanel({
  workspaceId,
  projectId,
  crawlId,
}: Readonly<{
  workspaceId: string;
  projectId: string;
  crawlId: string;
}>) {
  const readiness = useQuery(siteHealthQueries.aeoReadiness({ workspaceId, projectId }, crawlId));
  const [detailKey, setDetailKey] = useState<string | null>(null);

  if (readiness.isLoading) {
    return (
      <StateBlock
        kind="loading"
        label="Loading AEO readiness"
        shape={{ kind: 'table', columns: 4 }}
      />
    );
  }
  if (readiness.isError)
    return (
      <StateBlock
        kind="error"
        {...readErrorProps(readiness)}
        fallback="Retry in a moment."
        title="Couldn't load AEO readiness"
      />
    );
  if (!readiness.data || readiness.data.crawl_id === null) {
    return (
      <Notice tone="info">
        {readiness.data?.limitations[0] ??
          'AEO readiness appears once a crawl has finished analyzing pages.'}
      </Notice>
    );
  }

  const data = readiness.data;
  const selected = data.dimensions.find((dimension) => dimension.key === detailKey) ?? null;
  return (
    <Stack gap="workspace" className="min-w-0" data-testid="aeo-readiness">
      {data.limitations.length > 0 ? (
        <Notice tone="info">{data.limitations.join(' ')}</Notice>
      ) : null}
      <ReadinessLedger dimensions={data.dimensions} onOpen={setDetailKey} />
      <DimensionDrawer dimension={selected} crawlId={crawlId} onClose={() => setDetailKey(null)} />
    </Stack>
  );
}

function ReadinessLedger({
  dimensions,
  onOpen,
}: Readonly<{ dimensions: ReadinessDimension[]; onOpen: (key: string) => void }>) {
  return (
    <DataTable title="Readiness dimensions" columns={READINESS_COLUMNS}>
      {dimensions.map((dimension) => {
        const state = dimensionState(dimension);
        const reason = bandReason(dimension);
        const open = () => onOpen(dimension.key);
        return (
          // The row is the drawer's trigger; its name cell is the button a
          // keyboard and a screen reader reach, named by the pillar.
          <TableRow key={dimension.key} onClick={open} className="cursor-pointer">
            <TableCell>
              <Pressable
                aria-haspopup="dialog"
                aria-label={`${dimension.label} evidence`}
                onClick={(event) => {
                  event.stopPropagation();
                  open();
                }}
                className="grid min-w-0"
              >
                <ClampText lines={1} className={textRole('emphasis')}>
                  {dimension.label}
                </ClampText>
                <ClampText lines={1} className="type-caption">
                  {dimension.description}
                </ClampText>
              </Pressable>
            </TableCell>
            {/* The number only; the State column says why a
                dimension has none. */}
            <TableCell numeric>{formatScore(dimension.score)}</TableCell>
            <TableCell numeric>
              {dimension.coverage === null ? (
                <Absence state="not_measured" />
              ) : (
                formatPercent(dimension.coverage)
              )}
            </TableCell>
            <TableCell>
              {/* Reads "Nearly there: 1 check unresolved". */}
              <Inline>
                <StatusMark tone={DIMENSION_TONES[state]}>{state}</StatusMark>
                {reason ? <ClampText className="type-caption">{reason}</ClampText> : null}
              </Inline>
            </TableCell>
          </TableRow>
        );
      })}
    </DataTable>
  );
}

const READINESS_COLUMNS: readonly DataTableColumn[] = [
  { key: 'dimension', label: 'Dimension', kind: 'identity' },
  { key: 'score', label: 'Score', kind: 'number' },
  { key: 'coverage', label: 'Coverage', kind: 'number' },
  // The mark never cuts and its reason takes what is left, so the state flexes too.
  { key: 'state', label: 'State', kind: 'status', width: 'flex' },
];

function DimensionDrawer({
  dimension,
  crawlId,
  onClose,
}: Readonly<{
  dimension: ReadinessDimension | null;
  crawlId: string;
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
        <Stack gap="workspace">
          <CheckLedger checks={dimension.checks} />
          <FailingPages dimension={dimension} crawlId={crawlId} />
        </Stack>
      ) : null}
    </Drawer>
  );
}

function CheckLedger({ checks }: Readonly<{ checks: ReadinessCheck[] }>) {
  return (
    <Stack as="section" gap="item">
      <EditorialSectionHeader title="Checks" />
      {checks.length === 0 ? (
        <StateBlock kind="empty" inline message="No determinate checks were recorded." />
      ) : (
        <ul className={ledgerClasses()}>
          {checks.map((check) => (
            <CheckRow key={check.rule_id} check={check} />
          ))}
        </ul>
      )}
    </Stack>
  );
}

function CheckRow({ check }: Readonly<{ check: ReadinessCheck }>) {
  const state = checkState(check);
  return (
    <Stack as="li" gap="tight" className={ledgerItemClasses()}>
      <Inline className="flex-wrap justify-between">
        <span className={textRole('body')}>{check.title}</span>
        <StatusMark tone={CHECK_TONES[state]}>{state}</StatusMark>
      </Inline>
      <p className={textRole('body', check.remediation ? 'text-ink' : 'text-ink-2')}>
        {check.remediation || 'No remediation guidance is recorded for this check.'}
      </p>
      <p className="type-caption tabular-nums">
        {check.satisfied_count} satisfied · {check.partial_count} partial · {check.missing_count}{' '}
        missing · {check.unknown_count} unknown
      </p>
    </Stack>
  );
}

function checkState(check: ReadinessCheck): CheckState {
  if (check.error_count > 0 || check.unknown_count > 0) return 'Incomplete';
  if (check.missing_count > 0 || check.partial_count > 0) return 'Needs work';
  if (check.satisfied_count > 0) return 'Passing';
  if (check.not_applicable_count > 0) return 'Did not apply';
  return 'Not checked';
}

/** Says whether the list is the whole set or only its worst rows. */
function failingPagesCaption(shown: number, total: number): string {
  if (total === 0) return 'No failing pages were recorded.';
  if (shown < total) {
    return `Showing ${formatCount(shown)} of ${formatCount(total)} pages affected, worst first.`;
  }
  return `${pluralCount(total, 'page')} failed at least one check, worst first.`;
}

function FailingPages({
  dimension,
  crawlId,
}: Readonly<{ dimension: ReadinessDimension; crawlId: string }>) {
  const shown = dimension.evidence_pages.length;
  const total = dimension.failing_page_count;
  return (
    <Stack as="section" gap="item">
      <EditorialSectionHeader
        title="Pages to fix"
        description={failingPagesCaption(shown, total)}
      />
      <ul className={ledgerClasses()}>
        {dimension.evidence_pages.map((page) => (
          <Stack as="li" gap="item" key={page.site_url_id} className={ledgerItemClasses()}>
            <TextLink
              text="body"
              className="truncate"
              href={`/site/crawls/${crawlId}/pages/${page.site_url_id}`}
            >
              {pageLabel(page.normalized_url)}
            </TextLink>
            <Stack as="ul" gap="tight">
              {page.failed_checks.map((check) => (
                <Inline as="li" key={check.rule_id} className="type-caption items-baseline">
                  <Dot className="bg-negative" />
                  <span>
                    {check.title}: {check.expected_capability}
                  </span>
                </Inline>
              ))}
            </Stack>
            <PageActions page={page} dimensionLabel={dimension.label} />
          </Stack>
        ))}
      </ul>
    </Stack>
  );
}

/** The next action for one failing page: the prompt for its failing checks. */
function PageActions({
  page,
  dimensionLabel,
}: Readonly<{
  page: ReadinessDimension['evidence_pages'][number];
  dimensionLabel: string;
}>) {
  // Every failing check gets the prompt a developer or assistant can act on.
  const promptChecks = page.failed_checks;
  return (
    <Inline gap="compact" className="flex-wrap">
      {promptChecks.length > 0 ? (
        <CopyButton
          value={fixPrompt(dimensionLabel, page.normalized_url, promptChecks)}
          variant="secondary"
        >
          Copy fix prompt
        </CopyButton>
      ) : null}
    </Inline>
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
