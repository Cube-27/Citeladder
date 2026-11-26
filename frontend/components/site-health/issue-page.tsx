import { askAgentPrompt, buildFixPrompt } from '@/lib/site-health/issue-prompts';
import { AskAgentLink } from '@/components/agent/ask-agent-link';
import { useLocation } from 'react-router-dom';
import { IssueEvidence } from '@/components/site-health/issue-evidence';
import { IssueFixActions, type IssueFixScope } from '@/components/site-health/issue-fix-actions';
import { IssueValueLine, showsPageText, valueRange } from '@/components/site-health/issue-value';
import { AffectedPageLink, SharedOccurrences } from '@/components/site-health/shared-occurrences';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { IssueUrlTable } from '@/components/site-health/issue-urls';
import { Absence } from '@/components/ui/absence';
import {
  Section,
  SectionBleed,
  SectionFooter,
  SectionHeader,
  SectionTitle,
  SectionStack,
  TitledSection,
} from '@/components/ui/section';
import { siteHealthQueries } from '@/lib/api/site-health-queries';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { PageDrawerHost } from '@/components/site-health/page-drawer';
import { ReportPage } from '@/components/templates/report-page';
import { IssueSeverityMark } from '@/components/site-health/issue-metadata';
import { formatCount, formatPercent } from '@/lib/format';
import { Inline, Stack } from '@/components/ui/layout';
import { Pager } from '@/components/ui/pager';
import { Skeleton } from '@/components/ui/skeleton';
import { textRole } from '@/components/ui/typography';
import { useAgentPanelSeed } from '@/lib/agent/panel-context';
import type {
  AffectedPage,
  IssueFixProgress,
  SiteIssue,
  SiteIssueDetail,
} from '@citeladder/contracts';
import { originOf, sitePath } from '@/lib/site-health/evidence-values';
import {
  isSiteLevelRule,
  linkOutcomeLabel,
  pageCountLabel,
  siteLevelEvidence,
  type SiteLevelEvidence,
} from '@/lib/site-health/site-level-evidence';
import { issueTitle } from '@/lib/site-health/issues';
import {
  groupOccurrences,
  loadedPageCount,
  type OccurrenceEntry,
} from '@/lib/site-health/occurrence-groups';
import { FigureStrip } from '@/components/ui/figure-strip';
import { ClampText } from '@/components/ui/clamp-text';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

export type IssueHead = Pick<
  SiteIssue,
  | 'group_id'
  | 'rule_id'
  | 'title'
  | 'dimension'
  | 'severity'
  | 'description'
  | 'remediation'
  | 'affected_url_count'
> &
  Partial<Pick<SiteIssue, 'page_kinds'>>;

function IssueBrief({ issue }: Readonly<{ issue: IssueHead }>) {
  if (!issue.description && !issue.remediation) return null;
  return (
    <Stack gap="item">
      {issue.description ? (
        <p className={textRole('body', 'max-w-prose')}>{issue.description}</p>
      ) : null}
      {issue.remediation ? (
        <p className={textRole('body', 'max-w-prose whitespace-pre-line')}>{issue.remediation}</p>
      ) : null}
    </Stack>
  );
}

export function IssuePage({
  issue,
  scope,
  crawlId,
  pageKind,
  detailQuery,
  canPrevious,
  onPrevious,
  onNext,
  onClose,
}: Readonly<{
  issue: IssueHead;
  scope: IssueFixScope;
  crawlId: string;
  pageKind?: string;
  detailQuery: UseQueryResult<SiteIssueDetail>;
  canPrevious: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}>) {
  const loaded = detailQuery.isError ? undefined : detailQuery.data;
  const detail = loaded?.group_id === issue.group_id ? loaded : undefined;
  const handoff = {
    issueGroup: { crawlId, groupId: issue.group_id },
    prompt: askAgentPrompt(issue),
    skillId: 'technical_health',
  };
  useAgentPanelSeed(handoff);
  const pageLevel = !isSiteLevelRule(issue.rule_id);
  const title = issueTitle(issue);
  const crawl = useQuery(siteHealthQueries.crawl(scope.workspaceId, crawlId));
  const audited = crawl.data?.score_summary?.analyzed_count ?? null;
  const fixes = useQuery(siteHealthQueries.issueFixes(scope.workspaceId, crawlId));
  const progress = fixes.data?.items.find((item) => item.group_id === issue.group_id);
  const location = useLocation();
  const back = new URLSearchParams(location.search);
  back.delete('issue');
  const backQuery = back.toString();
  return (
    <PageDrawerHost workspaceId={scope.workspaceId}>
      <ReportPage
        trail={[
          {
            label: 'Issues',
            href: `${location.pathname}${backQuery ? `?${backQuery}` : ''}`,
            onClick: (event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              onClose();
            },
          },
        ]}
        crumb={{ label: title }}
        actions={
          <Inline className="flex-wrap items-center justify-end">
            <IssueFixActions scope={scope} crawlId={crawlId} groupId={issue.group_id} />
            <CopyButton value={buildFixPrompt(issue)} variant="secondary" className="w-fit">
              Copy fix prompt
            </CopyButton>
          </Inline>
        }
      >
        <SectionStack label={title}>
          <TitledSection title={title} actions={<IssueSeverityMark issue={issue} />}>
            <IssueBrief issue={issue} />
            <IssueFigures issue={issue} audited={audited} progress={progress} />
          </TitledSection>
          {pageLevel ? (
            <IssueUrlTable
              workspaceId={scope.workspaceId}
              crawlId={crawlId}
              groupId={issue.group_id}
              ruleId={issue.rule_id}
              initialPageKind={pageKind}
            />
          ) : (
            <Section aria-busy={detailQuery.isFetching || undefined}>
              <SectionHeader>
                <SectionTitle level={3}>Affected pages</SectionTitle>
              </SectionHeader>
              <OccurrenceList
                issue={issue}
                detail={detail}
                crawlId={crawlId}
                query={detailQuery}
                firstPage={!canPrevious}
              />
              {canPrevious || detail?.next_cursor ? (
                <SectionFooter>
                  <Pager
                    hideWhenSinglePage
                    canPrev={canPrevious}
                    canNext={Boolean(detail?.next_cursor)}
                    onPrev={onPrevious}
                    onNext={onNext}
                    busy={detailQuery.isFetching}
                  />
                </SectionFooter>
              ) : null}
            </Section>
          )}
        </SectionStack>
      </ReportPage>
    </PageDrawerHost>
  );
}

type FigureFacts = Pick<IssueHead, 'affected_url_count'> &
  Partial<Pick<SiteIssue, 'new_url_count' | 'resolved_url_count'>>;

function IssueFigures({
  issue,
  audited,
  progress,
}: Readonly<{
  issue: FigureFacts;
  audited: number | null;
  progress:
    | Pick<IssueFixProgress, 'fixed_url_count' | 'verified_url_count' | 'rerun_url_count'>
    | undefined;
}>) {
  const count = (value: number | null | undefined) =>
    value === null || value === undefined ? <Absence state="not_measured" /> : formatCount(value);
  const figures = [
    { label: 'Affected pages', value: formatCount(issue.affected_url_count) },
    {
      label: 'Share of audited pages',
      value: audited ? formatPercent(issue.affected_url_count / audited) : count(null),
    },
    { label: 'New since last crawl', value: count(issue.new_url_count) },
    { label: 'Fixed since last crawl', value: count(issue.resolved_url_count) },
    ...(progress
      ? [
          { label: 'Marked fixed', value: formatCount(progress.fixed_url_count) },
          ...(progress.rerun_url_count === null
            ? []
            : [
                {
                  label: 'Awaiting re-audit',
                  value: formatCount(progress.fixed_url_count - progress.verified_url_count),
                },
              ]),
        ]
      : []),
  ];
  return (
    <FigureStrip
      label="Issue figures"
      segments={figures.map((figure) => ({ key: figure.label, ...figure }))}
    />
  );
}

export function PendingIssuePage({
  detailQuery,
  onClose,
}: Readonly<{ detailQuery: UseQueryResult<SiteIssueDetail>; onClose: () => void }>) {
  return (
    <ReportPage
      actions={
        <Button variant="secondary" onClick={onClose}>
          Back to issues
        </Button>
      }
    >
      <SectionStack label="Issue">
        {detailQuery.isError ? (
          <Notice
            kind="read"
            {...readErrorProps(detailQuery)}
            fallback="Couldn't load this issue."
            title="Couldn't load this issue"
          />
        ) : (
          <StateBlock kind="loading" label="Loading the issue…" shape={{ kind: 'list' }} />
        )}
      </SectionStack>
    </ReportPage>
  );
}

function OccurrenceList({
  issue,
  detail,
  crawlId,
  query,
  firstPage,
}: Readonly<{
  issue: IssueHead;
  detail: SiteIssueDetail | undefined;
  crawlId: string;
  query: UseQueryResult<SiteIssueDetail>;
  firstPage: boolean;
}>) {
  if (query.isError)
    return (
      <Notice
        kind="read"
        {...readErrorProps(query)}
        fallback="Couldn't load affected URLs."
        title="Couldn't load affected URLs"
      />
    );
  if (query.isPending || !detail) {
    return <Skeleton variant="list" rows={3} label="Loading affected pages" />;
  }
  if (detail.occurrences.length === 0)
    return <StateBlock kind="empty" inline message="No affected URLs found." />;
  const first = detail.occurrences[0];
  const siteLevel = first ? siteLevelEvidence(issue.rule_id, first.evidence) : null;
  if (siteLevel) return <SiteLevelList evidence={siteLevel} crawlId={crawlId} />;
  const complete = firstPage && !detail.next_cursor;
  const loaded = loadedPageCount(detail.occurrences);
  const entries: OccurrenceEntry<AffectedPage>[] = detail.occurrences.some((row) =>
    showsPageText(row.value),
  )
    ? detail.occurrences.map((occurrence): OccurrenceEntry<AffectedPage> => ({
        kind: 'page',
        occurrence,
      }))
    : groupOccurrences(detail.occurrences);
  return (
    <SectionBleed as="ul" rows>
      {entries.map((entry) =>
        entry.kind === 'page' ? (
          <PageOccurrence
            key={entry.occurrence.occurrence_id}
            issue={issue}
            occurrence={entry.occurrence}
            crawlId={crawlId}
          />
        ) : (
          <SharedOccurrences
            key={entry.key}
            issue={issue}
            entry={entry}
            crawlId={crawlId}
            scope={{
              pageCount: entry.pageCount,
              loadedPageCount: loaded,
              totalPageCount: detail.affected_url_count,
              complete,
            }}
          />
        ),
      )}
    </SectionBleed>
  );
}

function PageOccurrence({
  issue,
  occurrence,
  crawlId,
}: Readonly<{
  issue: IssueHead;
  occurrence: AffectedPage;
  crawlId: string;
}>) {
  const range = valueRange(occurrence.rule_id, occurrence.evidence, occurrence.value);
  return (
    <Stack as="li" gap="tight">
      <AffectedPageLink
        crawlId={crawlId}
        siteUrlId={occurrence.site_url_id}
        title={occurrence.title}
        url={occurrence.display_url}
        pageKind={occurrence.page_kind}
      />
      <IssueValueLine value={occurrence.value} hint={range?.hint} />
      {range ? null : <IssueEvidence occurrence={occurrence} />}
      <AskAgentLink
        appearance="text"
        handoff={{
          issueGroup: { crawlId, groupId: issue.group_id, siteUrlId: occurrence.site_url_id },
          prompt: askAgentPrompt(issue, occurrence.display_url),
          skillId: 'technical_health',
        }}
      >
        Ask agent about this page
      </AskAgentLink>
    </Stack>
  );
}

function SiteLevelList({
  evidence,
  crawlId,
}: Readonly<{ evidence: SiteLevelEvidence; crawlId: string }>) {
  if (evidence.kind === 'duplicate_sets')
    return <DuplicateSetList evidence={evidence} crawlId={crawlId} />;
  if (evidence.kind === 'link_targets')
    return <LinkTargetList evidence={evidence} crawlId={crawlId} />;
  if (evidence.pages.length === 0)
    return (
      <StateBlock
        kind="empty"
        inline
        message={evidence.total > 0 ? 'Affected pages not recorded.' : 'No affected URLs found.'}
      />
    );
  const hidden = evidence.total - evidence.pages.length;
  return (
    <>
      {evidence.sections.length > 0 ? (
        <SectionBleed as="ul" rows>
          {evidence.sections.map((section) => (
            <Inline as="li" key={section.pathPrefix} className="flex-wrap justify-between">
              <ClampText className={textRole('body', 'min-w-0 flex-1')}>
                {section.pathPrefix}
              </ClampText>
              <span className="type-caption tabular-nums">{pageCountLabel(section.pageCount)}</span>
            </Inline>
          ))}
        </SectionBleed>
      ) : null}
      <SectionBleed as="ul" rows>
        {evidence.pages.map((page) => (
          <Stack as="li" gap="tight" key={page.siteUrlId}>
            <AffectedPageLink
              crawlId={crawlId}
              siteUrlId={page.siteUrlId}
              title={page.title}
              url={page.url}
              pageKind={page.pageKind}
            />
            {page.clicksFromHome === null ? null : (
              <span className="type-caption tabular-nums">
                {page.clicksFromHome} clicks from the homepage
              </span>
            )}
          </Stack>
        ))}
      </SectionBleed>
      {hidden > 0 ? (
        <SectionFooter>
          <p className="type-caption">
            Showing {evidence.pages.length} of {evidence.total} pages.
          </p>
        </SectionFooter>
      ) : null}
    </>
  );
}

function DuplicateSetList({
  evidence,
  crawlId,
}: Readonly<{
  evidence: Extract<SiteLevelEvidence, { kind: 'duplicate_sets' }>;
  crawlId: string;
}>) {
  if (evidence.sets.length === 0)
    return (
      <StateBlock
        kind="empty"
        inline
        message={evidence.total === 0 ? 'No affected URLs found.' : 'Affected pages not recorded.'}
      />
    );
  const shown = evidence.sets.reduce((sum, set) => sum + set.pages.length, 0);
  return (
    <>
      <SectionBleed as="ul" rows>
        {evidence.sets.map((set) => (
          <Stack as="li" gap="tight" key={set.pages[0]?.siteUrlId ?? set.text}>
            <ClampText className={textRole('body')}>
              {`These ${pageCountLabel(set.pageCount)} share “${set.text}”`}
            </ClampText>
            {set.pages.length < set.pageCount ? (
              <span className="type-caption">Including:</span>
            ) : null}
            <Stack as="ul" gap="item">
              {set.pages.map((page) => (
                <li key={page.siteUrlId} className="flex min-h-6 min-w-0 items-center">
                  <AffectedPageLink
                    crawlId={crawlId}
                    siteUrlId={page.siteUrlId}
                    title={page.title}
                    url={page.url}
                    pageKind={page.pageKind}
                  />
                </li>
              ))}
            </Stack>
          </Stack>
        ))}
      </SectionBleed>
      {shown < evidence.total ? (
        <SectionFooter>
          <p className="type-caption">
            Showing {shown} of {evidence.total} pages.
          </p>
        </SectionFooter>
      ) : null}
    </>
  );
}

function LinkTargetList({
  evidence,
  crawlId,
}: Readonly<{
  evidence: Extract<SiteLevelEvidence, { kind: 'link_targets' }>;
  crawlId: string;
}>) {
  if (evidence.targets.length === 0)
    return (
      <StateBlock
        kind="empty"
        inline
        message={evidence.total === 0 ? 'No affected links found.' : 'Affected links not recorded.'}
      />
    );
  return (
    <SectionBleed as="ul" rows>
      {evidence.targets.map((target) => {
        const origin = originOf(target.url);
        const hidden = target.pageCount - target.pages.length;
        return (
          <Stack as="li" gap="tight" key={target.url}>
            <ClampText className={textRole('body')}>
              {`${sitePath(target.url, origin)} → ${linkOutcomeLabel(target.outcome, origin)}`}
            </ClampText>
            <span className="type-caption tabular-nums">
              On {pageCountLabel(target.pageCount)}
              {hidden > 0 ? ', including:' : ':'}
            </span>
            <Stack as="ul" gap="item">
              {target.pages.map((page) => (
                <li key={page.siteUrlId} className="flex min-h-6 min-w-0 items-center">
                  <AffectedPageLink
                    crawlId={crawlId}
                    siteUrlId={page.siteUrlId}
                    title={page.title}
                    url={page.url}
                    pageKind={page.pageKind}
                  />
                </li>
              ))}
            </Stack>
          </Stack>
        );
      })}
    </SectionBleed>
  );
}
