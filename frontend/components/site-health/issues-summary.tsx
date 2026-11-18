import { useId } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';

import { fixedLabel } from '@/components/site-health/issue-fix-actions';
import { IssueMetadata } from '@/components/site-health/issue-metadata';
import { Stack } from '@/components/ui/layout';
import { OpenRow } from '@/components/ui/list-row';
import { CountDonut } from '@/components/ui/part-donut';
import { StatusMark } from '@/components/ui/status-mark';
import { textRole } from '@/components/ui/typography';
import { Skeleton } from '@/components/ui/skeleton';
import { ledgerClasses, ledgerItemClasses } from '@/components/ui/workspace';
import type { IssueFixProgress, SiteIssue, SiteIssuesPage } from '@citeladder/contracts';
import { formatCount, pluralCount } from '@/lib/format';
import { firstSentence, issueTitle, severityCount } from '@/lib/site-health/issues';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { READ_FAILED } from '@/components/ui/state-block';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/ui/section';

/**
 * The top of the Issues screen: how many issue types the crawl has, how many
 * are high severity, and the few to fix first. It reads the crawl's
 * unfiltered issues, so it never changes as the list below is searched or
 * filtered.
 */
export function IssuesSummary({
  query,
  fixes = [],
  onOpen,
}: Readonly<{
  /** The crawl's worst issues, unfiltered; its summary counts the whole crawl. */
  query: UseQueryResult<SiteIssuesPage>;
  /** How far each issue's fix has come; an issue with none fixed shows no line. */
  fixes?: readonly IssueFixProgress[];
  onOpen: (groupId: string) => void;
}>) {
  if (query.isError && !query.data)
    return (
      <Notice
        kind="read"
        {...readErrorProps(query)}
        fallback={READ_FAILED}
        title="Couldn't load the issue summary"
      />
    );
  if (!query.data) return <IssuesSummaryLoading />;
  const { summary, items } = query.data;
  // The severity card is far shorter than the priority list, so it takes the
  // full row above it rather than stretching beside it.
  return (
    <Stack gap="workspace" className="min-w-0">
      <SeverityCard summary={summary} />
      {items.length > 0 ? <FixFirst issues={items} fixes={fixes} onOpen={onOpen} /> : null}
    </Stack>
  );
}

/** The loaded layout's two cards, as blocks, so the table below does not move. */
export function IssuesSummaryLoading() {
  return (
    <Stack gap="workspace" className="min-w-0">
      <Section>
        <Skeleton variant="text" lines={2} label="Loading the issue summary" />
      </Section>
      <Section>
        <Skeleton variant="list" rows={3} label="Loading the issue summary" />
      </Section>
    </Stack>
  );
}

/** Issue types by severity: the count, the high-severity count, the pages they reach. */
function SeverityCard({ summary }: Readonly<{ summary: SiteIssuesPage['summary'] }>) {
  const titleId = useId();
  const total = summary.defect_issue_type_count;
  const high = severityCount(summary.severity_counts, 'high');
  const counts = SEVERITIES.map((severity) => ({
    ...severity,
    count: severityCount(summary.severity_counts, severity.key),
  }));
  // The legend and ring sit at the card's right, beside the title (owner, 2026-11-17).
  const breakdown = counts.some((severity) => severity.count > 0) ? (
    <CountDonut
      label="Issue types by severity"
      parts={counts.map((severity) => ({
        key: severity.key,
        term: (
          <StatusMark variant="severity" value={severity.key}>
            {severity.label}
          </StatusMark>
        ),
        value: severity.count,
        stroke: severity.stroke,
      }))}
    />
  ) : null;
  return (
    <Section aria-labelledby={titleId}>
      <SectionHeader actions={breakdown}>
        <h2 id={titleId} className={textRole('figure')}>
          {issueTypesLabel(total)}
        </h2>
        <SectionDescription>{attentionLine(high, summary)}</SectionDescription>
      </SectionHeader>
    </Section>
  );
}

/** Each severity's ring ink matches its StatusMark's tone. */
const SEVERITIES = [
  { key: 'high', label: 'High', stroke: 'stroke-negative' },
  { key: 'medium', label: 'Medium', stroke: 'stroke-warning' },
  { key: 'low', label: 'Low', stroke: 'stroke-data-other' },
] as const;

function issueTypesLabel(total: number): string {
  if (total === 0) return 'No issue types to fix';
  return pluralCount(total, 'issue type');
}

/** How many are high severity, and how many pages the issue types reach. */
function attentionLine(high: number, summary: SiteIssuesPage['summary']): string {
  const pages = summary.affected_url_count;
  if (summary.defect_issue_type_count === 0) return 'This crawl found nothing to fix.';
  return `${formatCount(high)} high severity · ${pluralCount(pages, 'page')} affected`;
}

/** The worst issues, worst first, each opening its own detail. */
function FixFirst({
  issues,
  fixes,
  onOpen,
}: Readonly<{
  issues: readonly SiteIssue[];
  fixes: readonly IssueFixProgress[];
  onOpen: (groupId: string) => void;
}>) {
  const fixOf = new Map(fixes.map((fix) => [fix.group_id, fix]));
  return (
    <Section aria-labelledby="issues-fix-first">
      <SectionHeader>
        <SectionTitle id="issues-fix-first">Fix these first</SectionTitle>
        <SectionDescription>Top 3 by severity, then reach</SectionDescription>
      </SectionHeader>
      <ol className={ledgerClasses()}>
        {issues.map((issue) => {
          const fix = fixOf.get(issue.group_id);
          return (
            <li key={issue.group_id} className={ledgerItemClasses()}>
              <OpenRow
                onOpen={() => onOpen(issue.group_id)}
                title={issueTitle(issue)}
                meta={
                  <IssueMetadata issue={issue}>
                    <span className="tabular-nums">
                      {formatCount(issue.affected_url_count)}{' '}
                      {issue.affected_url_count === 1 ? 'page affected' : 'pages affected'}
                    </span>
                    {fix && fix.fixed_url_count > 0 ? (
                      <span className="tabular-nums">{fixedLabel(fix)}</span>
                    ) : null}
                  </IssueMetadata>
                }
                caption={issue.remediation ? firstSentence(issue.remediation) : null}
              />
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
