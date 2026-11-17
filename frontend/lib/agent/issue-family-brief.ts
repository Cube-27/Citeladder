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
  return groupOccurrences(issue.occurrences)
    .flatMap((entry) => (entry.kind === 'shared' ? [entry] : []))
    .toSorted((left, right) => right.pageCount - left.pageCount);
}

function evidenceText({ ruleId, facts }: Shared): string {
  const lead = sharedEvidenceLead(ruleId)?.replace(/:$/u, '').toLowerCase();
  return lead ? `${lead} ${facts.join(', ')}` : facts.join(', ');
}

function loadedPages(issue: SiteIssueDetail | undefined): number {
  return issue ? new Set(issue.occurrences.map((occurrence) => occurrence.site_url_id)).size : 0;
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
  const title = issue?.title || cohort.rule_label;
  const count = cohort.page_count;
  const urls = pluralCount(count, 'URL');
  const shared = sharedEvidence(issue);
  const top = shared[0];
  const loaded = loadedPages(issue);

  let overview = cohort.whole_site ? `${title} across the whole site.` : `${title} on ${urls}.`;
  if (top) {
    const which =
      top.pageCount === count && !cohort.whole_site
        ? `All ${formatCount(count)} show`
        : `${formatCount(top.pageCount)} of the ${formatCount(loaded)} pages checked show`;
    overview += ` ${which} the same ${evidenceText(top)}, so one fix where it is defined clears them together.`;
  }

  const crawled = cohort.crawl_analyzed_url_count;
  let reach = `It shows on ${urls} in the latest crawl.`;
  if (cohort.whole_site) reach = 'It applies to the whole site.';
  else if (crawled)
    reach = `${formatCount(count)} of your ${pluralCount(crawled, 'crawled URL')} ${count === 1 ? 'carries' : 'carry'} it.`;
  const why = [WHY_BY_GROUPING[grouping], reach].filter(Boolean).join(' ');

  const steps = [
    ...sentences(issue?.remediation || fix || ''),
    ...shared
      .slice(0, SHARED_STEPS_MAX)
      .map(
        (entry) =>
          `Start with ${evidenceText(entry)}: ${pluralCount(entry.pageCount, 'page')} share it`,
      ),
    cohort.whole_site || count === 1
      ? 'Ship the change; the next crawl re-checks it'
      : `Ship the change; the next crawl re-checks all ${urls}`,
  ];
  return { overview, why, steps };
}
