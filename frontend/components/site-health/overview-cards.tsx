import { useQuery } from '@tanstack/react-query';

import type { SiteScoreSummary } from '@citeladder/contracts';

import { ISSUE_COLUMNS, IssueRow } from '@/components/site-health/issue-rows';
import { Button } from '@/components/ui/button';
import { ClampText } from '@/components/ui/clamp-text';
import { DataTable, type DataTableState } from '@/components/ui/data-table';
import { Inline, Stack } from '@/components/ui/layout';
import { readErrorProps } from '@/components/ui/notice';
import { PartDonut } from '@/components/ui/part-donut';
import { ProjectLink } from '@/components/ui/project-link';
import { BarRows } from '@/components/ui/score-gauge';
import { TitledSection } from '@/components/ui/section';
import { READ_FAILED, StateBlock } from '@/components/ui/state-block';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import type { IssuesParams } from '@/lib/api/site-health';
import { siteHealthQueries } from '@/lib/api/site-health-queries';
import { formatCount } from '@/lib/format';
import { ICONS } from '@/lib/icons';
import { byPageKindRows, pageKindLabel } from '@/lib/site-health/page-kinds';

const TOP_ISSUE_PARAMS = { limit: 8, sort: 'severity' } satisfies IssuesParams;

export function IssueTable({
  title,
  workspaceId,
  crawlId,
  params,
}: Readonly<{ title: string; workspaceId: string; crawlId: string; params: IssuesParams }>) {
  const issues = useQuery(siteHealthQueries.issues(workspaceId, crawlId, params));
  const rows = issues.data?.items ?? [];
  let state: DataTableState | undefined;
  if (issues.isError && !issues.data)
    state = {
      kind: 'error',
      ...readErrorProps(issues),
      fallback: READ_FAILED,
      title: "Couldn't load issues for this crawl",
    };
  else if (!issues.data) state = { kind: 'loading', label: 'Loading issues…' };
  else if (rows.length === 0)
    state = { kind: 'empty', icon: ICONS.issues, headingLevel: 3, heading: 'No issues found' };
  return (
    <DataTable
      title={title}
      toolbar={{
        actions: (
          <Button asChild variant="secondary">
            <ProjectLink href="/issues">View all issues</ProjectLink>
          </Button>
        ),
      }}
      columns={ISSUE_COLUMNS}
      state={state}
    >
      {rows.map((issue) => (
        <IssueRow
          key={issue.group_id}
          issue={issue}
          name={(name) => (
            <TextLink
              text="body"
              underline="hover"
              href={`/issues?issue=${issue.group_id}`}
              className="inline-flex min-h-6 min-w-0 items-center"
            >
              <ClampText lines={1}>{name}</ClampText>
            </TextLink>
          )}
        />
      ))}
    </DataTable>
  );
}

export function TopIssues({
  workspaceId,
  crawlId,
}: Readonly<{ workspaceId: string; crawlId: string }>) {
  return (
    <IssueTable
      title="Top issues"
      workspaceId={workspaceId}
      crawlId={crawlId}
      params={TOP_ISSUE_PARAMS}
    />
  );
}

export function PageKindsCard({ summary }: Readonly<{ summary: SiteScoreSummary | null }>) {
  const rows = summary ? byPageKindRows(summary.by_page_kind) : [];
  const parts = rows
    .filter((row) => row.analyzed_count > 0)
    .sort((a, b) => b.analyzed_count - a.analyzed_count)
    .map((row) => ({ label: pageKindLabel(row.page_kind), value: row.analyzed_count }));
  const audited = parts.reduce((sum, part) => sum + part.value, 0);
  return (
    <TitledSection title="Audited pages by kind">
      {parts.length === 0 ? (
        <StateBlock kind="empty" inline message="Pages not classified yet." />
      ) : (
        <PartDonut
          label="Audited pages by kind"
          parts={parts}
          total={audited}
          remainderLabel="Other kinds"
        />
      )}
    </TitledSection>
  );
}

function compactCount(value: number): string {
  if (value < 10_000) return formatCount(value);
  return `${(value / 1000).toFixed(1)}k`;
}

export function KnownUrlsCard({ summary }: Readonly<{ summary: SiteScoreSummary | null }>) {
  const weighting = summary?.score_weighting.kind === 'site_share' ? summary.score_weighting : null;
  if (!weighting || !summary) return null;
  const strata = [...weighting.strata].sort((a, b) => b.known_url_count - a.known_url_count);
  return (
    <TitledSection title="Known URLs">
      <Stack gap="item">
        <Inline className="items-baseline">
          <span className={textRole('figure')}>{formatCount(weighting.known_url_count)}</span>
          <span className={textRole('caption')}>{formatCount(summary.analyzed_count)} sampled</span>
        </Inline>
        <BarRows
          label="Known URLs by page kind"
          rows={strata.map((row) => ({
            key: row.page_kind,
            label: pageKindLabel(row.page_kind),
            figure: compactCount(row.known_url_count),
            share:
              weighting.known_url_count > 0
                ? row.known_url_count / weighting.known_url_count
                : null,
            tone: 'info',
          }))}
        />
      </Stack>
    </TitledSection>
  );
}
