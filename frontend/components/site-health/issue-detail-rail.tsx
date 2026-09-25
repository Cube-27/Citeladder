'use client';

import { ProjectLink } from '@/components/layout/scoped-link';

import { IssueEvidence } from '@/components/site-health/issue-evidence';
import { IssueMetadata } from '@/components/site-health/issue-metadata';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { BusyBar } from '@/components/ui/busy-bar';
import { CopyButton } from '@/components/ui/copy-button';
import { panelClasses } from '@/components/ui/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { textRole } from '@/components/ui/typography';
import { ledgerClasses } from '@/components/ui/workspace';
import { agentHandoffHref } from '@/lib/agent/handoff';
import type { SiteIssue, SiteIssueDetail } from '@/lib/api/types';
import { dimensionLabel, issueTitle, severityLabel } from '@/lib/site-health/issues';
import { pageKindLabel } from '@/lib/site-health/page-kinds';
import { pageDisplayTitle } from '@/lib/site-health/status';

/**
 * The right half of the Issues catalog: one issue in full, and the pages it
 * was found on. It lives beside the list rather than inside it because the
 * two answer different questions — which issues exist, and what this one is.
 */
export function IssueDetailRail({
  issue,
  crawlId,
  detailQuery,
  canPrevious,
  onPrevious,
  onNext,
}: Readonly<{
  issue: SiteIssue;
  crawlId: string;
  detailQuery: {
    data: SiteIssueDetail | undefined;
    isError: boolean;
    isFetching: boolean;
    isPending: boolean;
  };
  canPrevious: boolean;
  onPrevious: () => void;
  onNext: () => void;
}>) {
  const detail = detailQuery.data;
  return (
    <section
      className="min-w-0 min-[701px]:sticky min-[701px]:top-[var(--workspace-gap)] min-[701px]:max-h-[calc(100dvh-2*var(--workspace-gap))] min-[701px]:overflow-hidden"
      aria-busy={detailQuery.isFetching}
    >
      <div className="relative flex flex-col min-[701px]:max-h-[calc(100dvh-2*var(--workspace-gap))]">
        <BusyBar active={detailQuery.isFetching} label="Updating issue evidence" />
        <header className="border-border-subtle grid min-w-0 shrink-0 gap-3 border-b p-[var(--card-padding)]">
          <div className="flex min-w-0 items-start justify-between gap-[var(--workspace-gap)] max-[700px]:flex-col">
            <div className="grid min-w-0 gap-2">
              <h2 className={textRole('sectionTitle', 'tracking-[-0.02em]')}>
                {issueTitle(issue)}
              </h2>
              <IssueMetadata issue={issue} />
            </div>
            <div
              className={textRole(
                'body',
                'border-border-subtle grid shrink-0 gap-1 border-l pl-4 max-[700px]:w-full max-[700px]:border-t max-[700px]:border-l-0 max-[700px]:pt-3 max-[700px]:pl-0',
              )}
            >
              <span className="text-secondary whitespace-nowrap tabular-nums">
                {issue.affected_url_count} {issue.affected_url_count === 1 ? 'page' : 'pages'}{' '}
                affected
              </span>
              {issue.page_kinds.length > 0 ? (
                <span className="text-muted flex max-w-56 flex-wrap items-center gap-1 text-xs">
                  <span>Affects</span>
                  {issue.page_kinds.map((kind, index) => (
                    <span key={kind} className="contents">
                      {index > 0 ? <span aria-hidden>·</span> : null}
                      <span>{pageKindLabel(kind)}</span>
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
          </div>
          <IssueActions issue={issue} />
        </header>
        <div className="content-scroll grid min-h-0 gap-[var(--workspace-gap)] p-[var(--card-padding)] min-[701px]:flex-1 min-[701px]:overflow-y-auto">
          {issue.description ? (
            <p className="text-secondary text-sm whitespace-pre-line">{issue.description}</p>
          ) : null}
          {issue.remediation ? (
            // Guidance, not a field. The `well` tone is the recessed INPUT
            // surface, so remediation copy inside it read as a disabled
            // textarea the reader could not edit. Hung off an accent edge it
            // reads as advice, and keeps the blue that marks helpful
            // interaction everywhere else.
            <div
              className={panelClasses(
                { tone: 'none', pad: 'none', edge: 'flush' },
                'border-accent-border grid gap-1 border-s-2 ps-3',
              )}
            >
              <span className={textRole('label')}>How to fix</span>
              <p className="text-secondary text-sm whitespace-pre-line">{issue.remediation}</p>
            </div>
          ) : null}
          <OccurrenceList
            issue={issue}
            detail={detail}
            crawlId={crawlId}
            isError={detailQuery.isError}
            isPending={detailQuery.isPending}
          />
        </div>
        {detail && (canPrevious || detail.next_cursor) ? (
          <footer className="border-border-subtle bg-panel flex shrink-0 items-center justify-end gap-2 border-t p-3">
            <Button variant="secondary" size="sm" onClick={onPrevious} disabled={!canPrevious}>
              Previous
            </Button>
            {/* The retained page keeps its `next_cursor` while the next one is
                in flight, so a second click would push the SAME cursor onto
                the stack and Previous would need two presses to undo one. */}
            <Button
              variant="secondary"
              size="sm"
              onClick={onNext}
              disabled={!detail.next_cursor || detailQuery.isFetching}
            >
              Next
            </Button>
          </footer>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Every issue gets an action: the fix prompt a developer or assistant can use,
 * and Ask agent, which starts a chat about it in the Agent workspace.
 */
function IssueActions({ issue }: Readonly<{ issue: SiteIssue }>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CopyButton value={buildFixPrompt(issue)} size="sm" variant="secondary" className="w-fit">
        Copy fix prompt
      </CopyButton>
      <Button variant="secondary" size="sm" asChild>
        <ProjectLink href={agentHandoffHref({ prompt: askAgentPrompt(issue) })}>
          Ask agent
        </ProjectLink>
      </Button>
    </div>
  );
}

function askAgentPrompt(issue: SiteIssue, page?: string): string {
  const count = issue.affected_url_count;
  const scope = page ? ` on ${page}` : ` (${count} affected ${count === 1 ? 'page' : 'pages'})`;
  return `Help me fix the Site Health issue "${issueTitle(issue)}"${scope}.`;
}

const OCCURRENCE_PLACEHOLDERS = ['first', 'second', 'third'] as const;

function OccurrenceList({
  issue,
  detail,
  crawlId,
  isError,
  isPending,
}: Readonly<{
  issue: SiteIssue;
  detail: SiteIssueDetail | undefined;
  crawlId: string;
  isError: boolean;
  isPending: boolean;
}>) {
  if (isError) return <Alert tone="danger">Could not load affected URLs.</Alert>;
  // The list no longer waits for this read, so "none" and "not yet" are now
  // genuinely different answers here. Claiming the first while the second is
  // true told the reader an issue affected nothing, a moment before showing
  // them the pages it affects.
  if (isPending || !detail) {
    return (
      <ul aria-busy="true" className={ledgerClasses('ruled')}>
        {OCCURRENCE_PLACEHOLDERS.map((placeholder) => (
          <li key={placeholder} className="grid gap-2 p-3">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-4/5" />
          </li>
        ))}
      </ul>
    );
  }
  if (detail.occurrences.length === 0)
    return <p className={textRole('body')}>No affected URLs found.</p>;
  return (
    <ul className={ledgerClasses('ruled')}>
      {detail.occurrences.map((occurrence) => (
        <li key={occurrence.occurrence_id} className="grid gap-3 p-3">
          <ProjectLink
            href={`/site/crawls/${crawlId}/pages/${occurrence.site_url_id}`}
            className="hover:text-accent flex min-w-0 flex-col gap-0.5"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className={textRole('bodyStrong', 'truncate')}>
                {pageDisplayTitle(occurrence.title, occurrence.display_url)}
              </span>
              {occurrence.page_kind ? (
                <span className="text-muted shrink-0 text-xs">
                  {pageKindLabel(occurrence.page_kind)}
                </span>
              ) : null}
            </span>
            <span className="mono text-muted truncate text-xs" title={occurrence.display_url}>
              {occurrence.display_url}
            </span>
          </ProjectLink>
          <IssueEvidence occurrence={occurrence} />
          <Button variant="ghost" size="sm" asChild className="w-fit">
            <ProjectLink
              href={agentHandoffHref({
                siteUrlId: occurrence.site_url_id,
                prompt: askAgentPrompt(issue, occurrence.display_url),
              })}
            >
              Ask agent about this page
            </ProjectLink>
          </Button>
        </li>
      ))}
    </ul>
  );
}

function buildFixPrompt(issue: SiteIssue): string {
  const lines = [
    `Fix this Site Health issue on my website: "${issueTitle(issue)}" (${dimensionLabel(issue.dimension)}, ${severityLabel(issue.severity)} severity).`,
  ];
  if (issue.description) lines.push('', 'What is wrong:', issue.description);
  if (issue.remediation) lines.push('', 'Recommended remediation:', issue.remediation);
  return lines.join('\n');
}
