import { ScoreCard } from '@/components/site-health/score-cards';
import { AppGrid } from '@/components/ui/app-grid';
import type { BarRow } from '@/components/ui/score-gauge';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { StatusMark, type StatusTone } from '@/components/ui/status-mark';
import { CopyButton } from '@/components/ui/copy-button';
import { Drawer } from '@/components/ui/drawer';
import { Dot } from '@/components/ui/icon';
import { Inline, Stack } from '@/components/ui/layout';
import { TextLink } from '@/components/ui/text-link';
import { siteHealthQueries } from '@/lib/api/site-health-queries';
import type { ReadinessCheck, ReadinessDimension, SiteScoreSummary } from '@citeladder/contracts';
import {
  DimensionsTable,
  KindScoresTable,
  ReadableCard,
} from '@/components/site-health/aeo-readiness-cards';
import { IssueTable } from '@/components/site-health/overview-cards';
import type { IssuesParams } from '@/lib/api/site-health';

const AEO_ISSUE_PARAMS = { section: 'aeo', sort: 'severity', limit: 25 } satisfies IssuesParams;
import { textRole } from '@/components/ui/typography';
import {
  EditorialSectionHeader,
  ledgerClasses,
  ledgerItemClasses,
} from '@/components/ui/workspace';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import { formatCount } from '@/lib/format';

function pageLabel(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}

type CheckState = 'Incomplete' | 'Needs work' | 'Passing' | 'Did not apply' | 'Not checked';

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
  summary,
}: Readonly<{
  workspaceId: string;
  projectId: string;
  crawlId: string;
  summary: SiteScoreSummary | null;
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
      <Notice tone="info">{readiness.data?.limitations[0] ?? 'No analyzed crawl yet.'}</Notice>
    );
  }

  const data = readiness.data;
  const selected = data.dimensions.find((dimension) => dimension.key === detailKey) ?? null;
  return (
    <Stack gap="workspace" className="min-w-0" data-testid="aeo-readiness">
      {data.limitations.length > 0 ? (
        <Notice tone="info">{data.limitations.join(' ')}</Notice>
      ) : null}
      <AppGrid layout="aside-main">
        <ScoreCard
          title="AEO readiness"
          score={data.score}
          state={data.state}
          rows={[
            pageRow('analyzed', 'Pages audited', data.analysis_count, data.analysis_count),
            pageRow(
              'affected',
              'Pages with an AEO gap',
              data.affected_page_count,
              data.analysis_count,
            ),
          ]}
        />
        <ReadableCard dimensions={data.dimensions} />
      </AppGrid>
      <DimensionsTable dimensions={data.dimensions} onOpen={setDetailKey} />
      <KindScoresTable summary={summary} />
      <IssueTable
        title="AEO issues"
        workspaceId={workspaceId}
        crawlId={crawlId}
        params={AEO_ISSUE_PARAMS}
      />
      <DimensionDrawer dimension={selected} crawlId={crawlId} onClose={() => setDetailKey(null)} />
    </Stack>
  );
}

function pageRow(key: string, label: string, count: number, of: number): BarRow {
  return {
    key,
    label,
    figure: formatCount(count),
    share: of > 0 ? count / of : null,
    tone: key === 'affected' ? 'negative' : 'info',
  };
}

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
        {check.remediation || '—'}
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

function failingPagesCaption(shown: number, total: number): string | undefined {
  if (total === 0) return '—';
  return shown < total ? `Worst ${formatCount(shown)} of ${formatCount(total)}` : undefined;
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

function PageActions({
  page,
  dimensionLabel,
}: Readonly<{
  page: ReadinessDimension['evidence_pages'][number];
  dimensionLabel: string;
}>) {
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

function fixPrompt(
  dimensionLabel: string,
  url: string,
  checks: ReadinessDimension['evidence_pages'][number]['failed_checks'],
): string {
  const lines = checks.map((check) => `- ${check.title}: ${check.remediation}`);
  return [`Improve ${dimensionLabel} on ${url}.`, '', 'Failing checks:', ...lines].join('\n');
}
