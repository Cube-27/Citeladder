import type {
  DuplicateMetadataEvidence,
  PageListEvidence,
  UnhubbedPageKindEvidence,
} from '@citeladder/contracts/site-health';
import { policy } from '../config.ts';
import { record } from '../db/json.ts';
import { onlyOf } from '../lists.ts';
import { compareText } from '../text-order.ts';
import { canonicalDeclarations } from './analysis/finalize.ts';
import {
  exactDuplicateSets,
  type ArchitecturePage,
  type buildArchitecture,
} from './architecture-model.ts';
import { canonicalUrl } from './url-identity.ts';

const p = policy.site_health.architecture;

type KindRow = ReturnType<typeof buildArchitecture>['page_kinds'][number];
/** The bounded sample a finding names: its pages or its page kinds. */
type Sample = Pick<PageListEvidence, 'pages'> | Pick<UnhubbedPageKindEvidence, 'page_kinds'>;
const pageSample = (pages: PageListEvidence['pages']) => ({ pages });
const evidencePage = (page: ArchitecturePage) => ({
  site_url_id: page.id,
  url: page.url,
  title: page.title,
  page_kind: page.kind,
});
const kindCounts = (kind: KindRow) => ({
  page_kind: kind.page_kind,
  page_count: kind.page_count,
  duplicate_metadata_count: kind.duplicate_metadata_count,
});

/** Each kind with the pages no hub parents. */
const unhubbedSample =
  (byId: Map<string, ArchitecturePage>) =>
  (kinds: KindRow[]): Pick<UnhubbedPageKindEvidence, 'page_kinds'> => ({
    page_kinds: kinds.map((kind) => ({
      ...kindCounts(kind),
      pages: kind.site_url_ids
        .slice(0, p.max_evidence_items)
        .map((id) => evidencePage(byId.get(id)!)),
    })),
  });

/**
 * The affected pages of each page kind, over every row rather than the bounded
 * sample: the Issues page-kind filter counts a site-level finding by these.
 */
function pageKindCounts<Row extends { page_kind: string }>(
  rows: readonly Row[],
  pagesOf: (row: Row) => number = () => 1,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows)
    if (row.page_kind) counts[row.page_kind] = (counts[row.page_kind] ?? 0) + pagesOf(row);
  return counts;
}

function catalogRule(id: string) {
  const rule = policy.site_health.rule_catalog.find((item) => item.rule_id === id);
  if (!rule) throw new Error(`Architecture rule '${id}' is absent from its catalog`);
  return rule;
}

function evaluation<Row extends { page_kind: string }>(
  id: string,
  rows: Row[],
  sample: (rows: Row[]) => Sample,
  coverage: string,
  requiresComplete = false,
  pagesOf?: (row: Row) => number,
) {
  const rule = catalogRule(id);
  const unavailable = requiresComplete && coverage !== 'complete';
  let outcome = rows.length ? 'missing' : 'satisfied';
  if (unavailable) outcome = 'unknown';
  return {
    rule,
    outcome,
    reason: unavailable ? 'coverage_not_complete' : '',
    evidence: unavailable
      ? { reason: 'coverage_not_complete', coverage_state: coverage }
      : ({
          count: rows.length,
          ...sample(rows.slice(0, p.max_evidence_items)),
          page_kind_counts: pageKindCounts(rows, pagesOf),
          coverage_state: coverage,
        } satisfies PageListEvidence | UnhubbedPageKindEvidence),
  };
}

/**
 * Indexable pages across every page kind repeating one exact title or meta
 * description. A noindex page or one canonicalized elsewhere has already said
 * which page should rank, so it never counts.
 */
function duplicateMetadata(
  id: 'architecture.duplicate_titles' | 'architecture.duplicate_meta_descriptions',
  source: ArchitecturePage[],
  coverage: string,
) {
  const field = id === 'architecture.duplicate_titles' ? 'title' : 'description';
  const candidates = source.filter(
    (page) => page.indexable !== false && !canonicalizedElsewhere(page),
  );
  const sets = exactDuplicateSets(candidates, field);
  const affected = sets.flatMap((set) => set.pages);
  const evidence = {
    count: affected.length,
    duplicate_set_count: sets.length,
    duplicate_sets: sets.slice(0, p.max_evidence_items).map((set) => ({
      text: set.first[field],
      page_count: set.pages.length,
      pages: set.pages.slice(0, p.max_evidence_items).map(evidencePage),
    })),
    page_kind_counts: pageKindCounts(affected.map((page) => ({ page_kind: page.kind }))),
    coverage_state: coverage,
  } satisfies DuplicateMetadataEvidence;
  return {
    rule: catalogRule(id),
    outcome: sets.length ? 'missing' : 'satisfied',
    reason: '',
    evidence,
  };
}

function canonicalizedElsewhere(page: ArchitecturePage) {
  const declarations = canonicalDeclarations(page.facts).map((value) => value.trim());
  const declared = onlyOf([...new Set(declarations.filter(Boolean))]);
  const canonical = declared ? canonicalUrl(declared, page.url) : null;
  return canonical !== null && canonical !== page.url;
}
/** The first two path segments: `/blogs/testimonials/a-review` is `/blogs/testimonials`. */
function sectionOf(url: string) {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    return `/${segments.slice(0, 2).join('/')}`;
  } catch {
    return '/';
  }
}

/** Unreachable pages grouped by section, largest first, each with one example. */
function sections(pages: { url: string }[]) {
  const groups = new Map<
    string,
    { path_prefix: string; page_count: number; example_url: string }
  >();
  for (const page of pages) {
    const prefix = sectionOf(page.url);
    const group = groups.get(prefix);
    if (group) group.page_count += 1;
    else groups.set(prefix, { path_prefix: prefix, page_count: 1, example_url: page.url });
  }
  return [...groups.values()]
    .sort((a, b) => b.page_count - a.page_count || compareText(a.path_prefix, b.path_prefix))
    .slice(0, p.max_evidence_items);
}

/**
 * Pages other pages link to but no link path from the homepage reaches: a
 * section linked only from itself. Orphans (no inbound link at all) are
 * `architecture.orphan_pages`, so they never repeat here. Without an observed
 * homepage no page has a depth, and nothing can be called unreachable.
 */
function unreachableFromHome(
  pages: ReturnType<typeof buildArchitecture>['hierarchy'],
  byId: Map<string, ArchitecturePage>,
  coverage: string,
) {
  const unreachable = pages.filter(
    (page) =>
      page.page_kind !== 'homepage' &&
      page.depth_from_home === null &&
      byId.get(page.site_url_id)!.inbound > 0,
  );
  const result = evaluation(
    'architecture.unreachable_from_home',
    unreachable,
    pageSample,
    coverage,
    true,
  );
  if (result.outcome === 'unknown') return result;
  if (!pages.some((page) => page.depth_from_home === 0))
    return {
      ...result,
      outcome: 'unknown',
      reason: 'homepage_not_observed',
      evidence: { reason: 'homepage_not_observed', coverage_state: coverage },
    };
  return { ...result, evidence: { ...result.evidence, sections: sections(unreachable) } };
}

export function architectureRules(
  model: ReturnType<typeof buildArchitecture>,
  source: ArchitecturePage[],
  coverage: string,
) {
  const pages = model.hierarchy;
  const kinds = model.page_kinds;
  const byId = new Map(source.map((page) => [page.id, page]));
  const parents = new Map(pages.map((page) => [page.site_url_id, page.parent_site_url_id]));
  return [
    evaluation(
      'architecture.excessive_depth',
      pages.filter(
        (page) => page.depth_from_home !== null && page.depth_from_home >= p.excessive_depth_min,
      ),
      pageSample,
      coverage,
      // Depth is shortest path over the observed graph: a link the crawl did
      // not see can only make a page shallower, so it needs complete coverage.
      true,
    ),
    evaluation(
      'architecture.breadcrumb_hierarchy_conflict',
      pages.filter(
        (page) =>
          page.breadcrumb_parent_site_url_id &&
          page.explicit_parent_site_url_id &&
          page.breadcrumb_parent_site_url_id !== page.explicit_parent_site_url_id,
      ),
      pageSample,
      coverage,
    ),
    duplicateMetadata('architecture.duplicate_titles', source, coverage),
    duplicateMetadata('architecture.duplicate_meta_descriptions', source, coverage),
    evaluation(
      'architecture.dead_end_pages',
      pages.filter((page) => {
        const source = byId.get(page.site_url_id)!;
        // Links are read from the page's own facts: an unread body has none to judge.
        return (
          p.dead_end_page_kinds.includes(page.page_kind) &&
          record(source.facts.extraction).state === 'available' &&
          source.contentOutbound === 0
        );
      }),
      pageSample,
      coverage,
    ),
    evaluation(
      'architecture.orphan_pages',
      pages.filter(
        (page) => page.page_kind !== 'homepage' && byId.get(page.site_url_id)!.inbound === 0,
      ),
      pageSample,
      coverage,
      true,
    ),
    unreachableFromHome(pages, byId, coverage),
    evaluation(
      'architecture.parentless_detail_pages',
      pages.filter(
        (page) => p.detail_page_kinds.includes(page.page_kind) && page.parent_site_url_id === null,
      ),
      pageSample,
      coverage,
      true,
    ),
    evaluation(
      'architecture.unhubbed_page_kind',
      kinds.filter(
        (kind) =>
          kind.page_count >= p.unhubbed_page_kind_min_urls &&
          kind.site_url_ids.every(
            (id) => p.detail_page_kinds.includes(byId.get(id)!.kind) && parents.get(id) === null,
          ),
      ),
      unhubbedSample(byId),
      coverage,
      true,
      (kind) => kind.page_count,
    ),
  ];
}
