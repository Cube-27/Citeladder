'use client';

import { Badge } from '@/components/ui/badge';
import { EvidenceLine } from '@/components/site-health/issue-evidence';
import { Inline, Stack } from '@/components/ui/layout';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { ledgerItemClasses } from '@/components/ui/workspace';
import { agentHandoffHref } from '@/lib/agent/handoff';
import type { SiteIssue } from '@citeladder/contracts';
import { issueTitle } from '@/lib/site-health/issues';
import {
  sharedEvidenceLead,
  sharedPagesLabel,
  type OccurrenceEntry,
} from '@/lib/site-health/occurrence-groups';
import { pageKindLabel } from '@/lib/site-health/page-kinds';
import { pageDisplayTitle } from '@/lib/site-health/status';

/**
 * Evidence shared by several pages is usually one template element, so the
 * question is the one fix that clears it everywhere. The scope is built from
 * the counts, not from the label the reader sees, and claims no more than the
 * loaded rows prove.
 */
function sharedAskAgentPrompt(issue: SiteIssue, evidence: string, scope: SharedScope): string {
  const reach = scope.complete
    ? `${scope.pageCount} of the issue's ${scope.totalPageCount} affected pages`
    : `${scope.pageCount} of the ${scope.loadedPageCount} affected pages loaded so far; the issue affects ${scope.totalPageCount} pages`;
  return `Analyze the Site Health issue "${issueTitle(issue)}" where the same evidence, ${evidence}, was found on several pages (${reach}). Check whether it comes from one shared template or component and propose the one fix that clears it on every page.`;
}

type SharedScope = Parameters<typeof sharedPagesLabel>[0];

/**
 * Evidence several pages share, said once: the element, how many pages carry
 * it, one question for all of them, then the pages themselves. The handoff
 * names the issue group without a page, since the question is the fix that
 * clears every page at once.
 */
export function SharedOccurrences({
  issue,
  entry,
  crawlId,
  scope,
}: Readonly<{
  issue: SiteIssue;
  entry: Extract<OccurrenceEntry, { kind: 'shared' }>;
  crawlId: string;
  scope: SharedScope;
}>) {
  return (
    <Stack as="li" gap="item" className={ledgerItemClasses()}>
      <Stack gap="tight">
        <EvidenceLine
          lead={sharedEvidenceLead(entry.ruleId)}
          facts={entry.facts}
          text="itemTitle"
        />
        <span className="type-caption tabular-nums">{sharedPagesLabel(scope)}</span>
        <TextLink
          text="caption"
          className="w-fit"
          href={agentHandoffHref({
            issueGroup: { crawlId, groupId: issue.group_id },
            prompt: sharedAskAgentPrompt(issue, entry.facts.join(', '), scope),
            skillId: 'technical_health',
          })}
        >
          Ask agent about these pages
        </TextLink>
      </Stack>
      <Stack as="ul" gap="item">
        {entry.occurrences.map((occurrence) => (
          <li key={occurrence.occurrence_id} className="min-w-0">
            <AffectedPageLink
              crawlId={crawlId}
              siteUrlId={occurrence.site_url_id}
              title={occurrence.title}
              url={occurrence.display_url}
              pageKind={occurrence.page_kind}
            />
          </li>
        ))}
      </Stack>
    </Stack>
  );
}

/** One affected page: its title and kind, linking to its detail, over its URL. */
export function AffectedPageLink({
  crawlId,
  siteUrlId,
  title,
  url,
  pageKind,
}: Readonly<{
  crawlId: string;
  siteUrlId: string;
  title: string | null;
  url: string;
  pageKind: string | null;
}>) {
  return (
    <TextLink
      text="itemTitle"
      className="flex min-w-0 flex-col"
      href={`/site/crawls/${crawlId}/pages/${siteUrlId}`}
    >
      <Inline as="span" className="flex-wrap">
        <span className={textRole('itemTitle', '[overflow-wrap:anywhere]')}>
          {pageDisplayTitle(title, url)}
        </span>
        {pageKind ? <Badge>{pageKindLabel(pageKind)}</Badge> : null}
      </Inline>
      <span className="type-caption [overflow-wrap:anywhere] tabular-nums" title={url}>
        {url}
      </span>
    </TextLink>
  );
}
