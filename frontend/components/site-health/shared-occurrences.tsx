import { PageLink } from '@/components/site-health/page-link';
import { AskAgentLink } from '@/components/agent/ask-agent-link';
import { EvidenceLine } from '@/components/site-health/issue-evidence';
import { Inline, Stack } from '@/components/ui/layout';
import { UrlText } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import type { SiteIssue } from '@citeladder/contracts';
import { issueTitle } from '@/lib/site-health/issues';
import {
  sharedEvidenceLead,
  sharedPagesLabel,
  type OccurrenceEntry,
} from '@/lib/site-health/occurrence-groups';
import { pageKindLabel } from '@/lib/site-health/page-kinds';
import { pageDisplayTitle } from '@/lib/site-health/status';

type SharedIssue = Pick<SiteIssue, 'group_id' | 'title' | 'rule_id'>;

function sharedAskAgentPrompt(issue: SharedIssue, evidence: string, scope: SharedScope): string {
  const reach = scope.complete
    ? `${scope.pageCount} of the issue's ${scope.totalPageCount} affected pages`
    : `${scope.pageCount} of the ${scope.loadedPageCount} affected pages loaded so far; the issue affects ${scope.totalPageCount} pages`;
  return `Analyze the Website issue "${issueTitle(issue)}" where the same evidence, ${evidence}, was found on several pages (${reach}). Check whether it comes from one shared template or component and propose the one fix that clears it on every page.`;
}

type SharedScope = Parameters<typeof sharedPagesLabel>[0];

export function SharedOccurrences({
  issue,
  entry,
  crawlId,
  scope,
}: Readonly<{
  issue: SharedIssue;
  entry: Extract<OccurrenceEntry, { kind: 'shared' }>;
  crawlId: string;
  scope: SharedScope;
}>) {
  return (
    <Stack as="li" gap="item">
      <Stack gap="tight">
        <EvidenceLine lead={sharedEvidenceLead(entry.ruleId)} facts={entry.facts} text="body" />
        <span className="type-caption">{sharedPagesLabel(scope)}</span>
        <AskAgentLink
          appearance="text"
          handoff={{
            issueGroup: { crawlId, groupId: issue.group_id },
            prompt: sharedAskAgentPrompt(issue, entry.facts.join(', '), scope),
            skillId: 'technical_health',
          }}
        >
          Ask agent about these pages
        </AskAgentLink>
      </Stack>
      <Stack as="ul" gap="item">
        {entry.occurrences.map((occurrence) => (
          <li key={occurrence.occurrence_id} className="flex min-h-6 min-w-0 items-center">
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
    <PageLink text="body" className="block min-w-0" crawlId={crawlId} siteUrlId={siteUrlId}>
      <Stack as="span" gap="tight" className="min-w-0">
        <Inline as="span" className="items-baseline justify-between">
          <span
            className={textRole('body', 'min-w-0 truncate')}
            title={pageDisplayTitle(title, url)}
          >
            {pageDisplayTitle(title, url)}
          </span>
          {pageKind ? (
            <span className="type-caption shrink-0">{pageKindLabel(pageKind)}</span>
          ) : null}
        </Inline>
        <span className="type-caption flex min-w-0">
          <UrlText url={url} />
        </span>
      </Stack>
    </PageLink>
  );
}
