import { useQuery } from '@tanstack/react-query';

import type { SiteScoreSummary } from '@citeladder/contracts';

import { ISSUE_COLUMNS, IssueRow } from '@/components/site-health/issue-rows';
import { Button } from '@/components/ui/button';
import { ClampText } from '@/components/ui/clamp-text';
import { DataTable } from '@/components/ui/data-table';
import { Inline, Stack } from '@/components/ui/layout';
import { PartDonut } from '@/components/ui/part-donut';
import { ProjectLink } from '@/components/ui/project-link';
import { BarRows } from '@/components/ui/score-gauge';
import { TitledSection } from '@/components/ui/section';
import { queryTableState, StateBlock } from '@/components/ui/state-block';
import { TextLink } from '@/components/ui/text-link';
import { Text } from '@/components/ui/typography';
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
  const table = queryTableState(issues, {
    subject: 'issues for this crawl',
    empty: (data) =>
      data.items.length === 0
        ? { kind: 'empty', icon: ICONS.issues, headingLevel: 3, heading: 'No issues found' }
        : undefined,
  });
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
      {...table}
    >
      {rows.map((issue) => (
        <IssueRow
          key={issue.group_id}
          issue={issue}
          renderName={(name) => (
            <TextLink
              text="body"
              underline="hover"
              href={`/issues?issue=${issue.group_id}`}
              box="target-shrink"
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
        <Inline align="baseline">
          <Text variant="figure">{formatCount(weighting.known_url_count)}</Text>
          <Text variant="caption">{formatCount(summary.analyzed_count)} sampled</Text>
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
            tone: 'ink',
          }))}
        />
      </Stack>
    </TitledSection>
  );
}
