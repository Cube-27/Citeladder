/**
 * An issue-family Action's Overview, Why this matters and What to do, read
 * from the same Issues group the Site Health Issues page shows: its title, its
 * fix and the evidence on its loaded pages. A shared cause is claimed only
 * when the loaded pages show the same evidence, and only for those pages.
 */
import type { SiteIssueDetail } from '@citeladder/contracts';

import type { ActionDetail } from '@/lib/api/actions';
import { formatCount, pluralCount } from '@/lib/format';
import { sentences } from '@/lib/site-health/issues';
import { groupOccurrences, sharedEvidenceLead } from '@/lib/site-health/occurrence-groups';

type Cohort = NonNullable<ActionDetail['cohort']>;

/** Why a Site Health fix matters, by the Actions grouping its Issues tab files it under. */
const WHY_BY_GROUPING: Partial<Record<ActionDetail['grouping'], string>> = {
  aeo: 'AI answer engines and agents read this to understand, trust and cite your pages.',
  seo: 'Search engines and AI crawlers check this before they index, rank or cite a page.',
  content: 'AI answers quote what crawlers can read on your pages; this stands in the way.',
};

/** The most evidence lines What to do names, biggest first. */
const SHARED_STEPS_MAX = 3;

export type IssueFamilyBrief = Readonly<{ overview: string; why: string; steps: string[] }>;

type Shared = Readonly<{ ruleId: string; facts: readonly string[]; pageCount: number }>;

/** The evidence the loaded pages share, most pages first. */
function sharedEvidence(issue: SiteIssueDetail | undefined): Shared[] {
  if (!issue) return [];
  const shared: Shared[] = groupOccurrences(issue.occurrences).flatMap((entry) =>
    entry.kind === 'shared' ? [entry] : [],
  );
  return shared.sort((left, right) => right.pageCount - left.pageCount);
}

function evidenceText({ ruleId, facts }: Shared): string {
  const lead = sharedEvidenceLead(ruleId)?.replace(/:$/u, '').toLowerCase();
  return lead ? `${lead} ${facts.join(', ')}` : facts.join(', ');
}

function loadedPages(issue: SiteIssueDetail | undefined): number {
  return issue ? new Set(issue.occurrences.map((occurrence) => occurrence.site_url_id)).size : 0;
}

/** What is wrong and where; one shared fix only for the pages whose evidence shows it. */
function overviewOf(cohort: Cohort, title: string, shared: Shared[], loaded: number): string {
  const count = cohort.page_count;
  const scope = cohort.whole_site
    ? `${title} across the whole site.`
    : `${title} on ${pluralCount(count, 'URL')}.`;
  const top = shared[0];
  if (!top) return scope;
  const which =
    top.pageCount === count && !cohort.whole_site
      ? `All ${formatCount(count)} show`
      : `${formatCount(top.pageCount)} of the ${formatCount(loaded)} pages checked show`;
  return `${scope} ${which} the same ${evidenceText(top)}, so one fix where it is defined clears them together.`;
}

/** The grouping's reason and the issue's reach across the crawl, when the crawl recorded it. */
function whyOf(cohort: Cohort, grouping: ActionDetail['grouping']): string {
  const count = cohort.page_count;
  const crawled = cohort.crawl_analyzed_url_count;
  let reach = `It shows on ${pluralCount(count, 'URL')} in this crawl.`;
  if (cohort.whole_site) reach = 'It applies to the whole site.';
  else if (crawled)
    reach = `${formatCount(count)} of your ${pluralCount(crawled, 'crawled URL')} ${count === 1 ? 'carries' : 'carry'} it.`;
  return [WHY_BY_GROUPING[grouping], reach].filter(Boolean).join(' ');
}

/** The rule's fix, the shared evidence to start with, then the re-check. */
function stepsOf(cohort: Cohort, fix: string, shared: Shared[]): string[] {
  const count = cohort.page_count;
  return [
    ...sentences(fix),
    ...shared
      .slice(0, SHARED_STEPS_MAX)
      .map(
        (entry) =>
          `Start with ${evidenceText(entry)}: ${pluralCount(entry.pageCount, 'page')} share it`,
      ),
    cohort.whole_site || count === 1
      ? 'Ship the change; the next crawl re-checks it'
      : `Ship the change; the next crawl re-checks all ${pluralCount(count, 'URL')}`,
  ];
}

export function issueFamilyBrief({
  cohort,
  grouping,
  fix,
  issue,
}: Readonly<{
  cohort: Cohort;
  grouping: ActionDetail['grouping'];
  /** The rule's fix as the Actions read carries it, until the Issues group loads. */
  fix: string | null;
  issue: SiteIssueDetail | undefined;
}>): IssueFamilyBrief {
  const shared = sharedEvidence(issue);
  return {
    overview: overviewOf(cohort, issue?.title || cohort.rule_label, shared, loadedPages(issue)),
    why: whyOf(cohort, grouping),
    steps: stepsOf(cohort, issue?.remediation || fix || '', shared),
  };
}
