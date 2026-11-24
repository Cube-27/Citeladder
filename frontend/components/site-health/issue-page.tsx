import { askAgentPrompt, buildFixPrompt } from '@/lib/site-health/issue-prompts';
import { AskAgentLink } from '@/components/agent/ask-agent-link';
import { IssueEvidence } from '@/components/site-health/issue-evidence';
import { IssueFixActions, type IssueFixScope } from '@/components/site-health/issue-fix-actions';
import { IssuePagesExport } from '@/components/site-health/issues-export';
import { IssueValueLine, showsPageText, valueRange } from '@/components/site-health/issue-value';
import { AffectedPageLink, SharedOccurrences } from '@/components/site-health/shared-occurrences';
import type { UseQueryResult } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { PageDrawer } from '@/components/site-health/page-drawer';
import { PageOpenContext } from '@/components/site-health/page-open-context';
import { ReportPage } from '@/components/templates/report-page';
import { IssueSeverityMark } from '@/components/site-health/issue-metadata';
import { pluralCount } from '@/lib/format';
import { useState } from 'react';
import { Inline, Stack } from '@/components/ui/layout';
import { Pager } from '@/components/ui/pager';
import { ProjectLink } from '@/components/ui/project-link';
import { Skeleton } from '@/components/ui/skeleton';
import { textRole } from '@/components/ui/typography';
import { ledgerClasses, ledgerItemClasses } from '@/components/ui/workspace';
import { useAgentPanelSeed } from '@/lib/agent/panel-context';
import type { AffectedPage, SiteIssue, SiteIssueDetail } from '@citeladder/contracts';
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
import { pageKindLabel } from '@/lib/site-health/page-kinds';
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

export function IssuePage({
  issue,
  scope,
  crawlId,
  detailQuery,
  canPrevious,
  onPrevious,
  onNext,
  onClose,
}: Readonly<{
  issue: IssueHead;
  scope: IssueFixScope;
  crawlId: string;
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
  const pageKinds = issue.page_kinds ?? [];
  const pageLevel = !isSiteLevelRule(issue.rule_id);
  const [openPageId, setOpenPageId] = useState<string | null>(null);
  const title = issueTitle(issue);
  return (
    <ReportPage>
      <Stack as="section" aria-label={title} gap="workspace" className="min-w-0">
        <Inline className="items-start justify-between">
          <h2 className={textRole('heading', 'min-w-0')}>{title}</h2>
          <Button variant="secondary" onClick={onClose} className="shrink-0">
            Back to issues
          </Button>
        </Inline>
        <Inline className="flex-wrap">
          <IssueSeverityMark issue={issue} />
          <span className={textRole('body', 'text-ink-2')}>
            {pluralCount(issue.affected_url_count, 'page')} affected
          </span>
        </Inline>
        {issue.remediation ? (
          <Stack gap="tight" className="min-w-0">
            <span className="type-caption">How to fix</span>
            <p className={textRole('body', 'whitespace-pre-line')}>{issue.remediation}</p>
          </Stack>
        ) : null}
        {pageKinds.length > 0 ? (
          <Stack gap="tight" className="min-w-0">
            <span className="type-caption">Page kinds</span>
            <p className={textRole('body')}>{pageKinds.map(pageKindLabel).join(', ')}</p>
          </Stack>
        ) : null}
        <Inline className="flex-wrap">
          <AskAgentLink handoff={handoff} />
          <CopyButton value={buildFixPrompt(issue)} variant="secondary" className="w-fit">
            Copy fix prompt
          </CopyButton>
          {pageLevel ? (
            <>
              <Button variant="secondary" asChild>
                <ProjectLink href={pagesWithIssueHref(issue.rule_id)}>View in Pages</ProjectLink>
              </Button>
              <IssuePagesExport
                workspaceId={scope.workspaceId}
                crawlId={crawlId}
                groupId={issue.group_id}
              />
            </>
          ) : null}
        </Inline>
        <IssueFixActions scope={scope} crawlId={crawlId} groupId={issue.group_id} />
        <Stack as="section" gap="workspace" aria-busy={detailQuery.isFetching || undefined}>
          <h3 className={textRole('heading')}>Affected pages</h3>
          <PageOpenContext value={setOpenPageId}>
            <OccurrenceList
              issue={issue}
              detail={detail}
              crawlId={crawlId}
              query={detailQuery}
              firstPage={!canPrevious}
            />
          </PageOpenContext>
        </Stack>
        {detail || canPrevious ? (
          <Pager
            hideWhenSinglePage
            canPrev={canPrevious}
            canNext={Boolean(detail?.next_cursor)}
            onPrev={onPrevious}
            onNext={onNext}
            busy={detailQuery.isFetching}
          />
        ) : null}
      </Stack>
      <PageDrawer
        workspaceId={scope.workspaceId}
        crawlId={crawlId}
        siteUrlId={openPageId}
        onClose={() => setOpenPageId(null)}
      />
    </ReportPage>
  );
}

export function PendingIssuePage({
  detailQuery,
  onClose,
}: Readonly<{ detailQuery: UseQueryResult<SiteIssueDetail>; onClose: () => void }>) {
  return (
    <ReportPage>
      <Stack as="section" aria-label="Issue" gap="workspace" className="min-w-0">
        <Inline className="justify-end">
          <Button variant="secondary" onClick={onClose}>
            Back to issues
          </Button>
        </Inline>
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
      </Stack>
    </ReportPage>
  );
}

function pagesWithIssueHref(ruleId: string): string {
  const params = new URLSearchParams({ tab: 'pages', pages_view: 'all', pages_rule: ruleId });
  return `/site?${params.toString()}`;
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
    <ul className={ledgerClasses()}>
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
    </ul>
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
    <Stack as="li" gap="tight" className={ledgerItemClasses()}>
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
    <Stack gap="item">
      {evidence.sections.length > 0 ? (
        <ul className={ledgerClasses()}>
          {evidence.sections.map((section) => (
            <Inline
              as="li"
              key={section.pathPrefix}
              className={ledgerItemClasses('flex-wrap justify-between')}
            >
              <ClampText className={textRole('body', 'min-w-0 flex-1')}>
                {section.pathPrefix}
              </ClampText>
              <span className="type-caption tabular-nums">{pageCountLabel(section.pageCount)}</span>
            </Inline>
          ))}
        </ul>
      ) : null}
      <ul className={ledgerClasses()}>
        {evidence.pages.map((page) => (
          <Stack as="li" gap="tight" key={page.siteUrlId} className={ledgerItemClasses()}>
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
      </ul>
      {hidden > 0 ? (
        <p className="type-caption">
          Showing {evidence.pages.length} of {evidence.total} pages.
        </p>
      ) : null}
    </Stack>
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
    <Stack gap="item">
      <ul className={ledgerClasses()}>
        {evidence.sets.map((set) => (
          <Stack
            as="li"
            gap="tight"
            key={set.pages[0]?.siteUrlId ?? set.text}
            className={ledgerItemClasses()}
          >
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
      </ul>
      {shown < evidence.total ? (
        <p className="type-caption">
          Showing {shown} of {evidence.total} pages.
        </p>
      ) : null}
    </Stack>
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
    <ul className={ledgerClasses()}>
      {evidence.targets.map((target) => {
        const origin = originOf(target.url);
        const hidden = target.pageCount - target.pages.length;
        return (
          <Stack as="li" gap="tight" key={target.url} className={ledgerItemClasses()}>
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
    </ul>
  );
}
