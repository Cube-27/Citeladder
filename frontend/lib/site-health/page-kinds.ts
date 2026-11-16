/**
 * Site Health page-kind vocabulary + presentation helpers (v2 P1) — PURE.
 *
 * The SINGLE shared mapping from the backend `page_kind` classification
 * vocabulary to humanized labels — every badge, filter control, and the
 * dashboard per-type breakdown reads it from here (no duplicated maps).
 * No transport, no React.
 */
import { pageKindSchema } from '@citeladder/contracts/site-health';
import type { PageKind, PageKindScoreSummary } from '@citeladder/contracts';
import { sentenceCaseStatus } from '@/lib/utils';

/**
 * Every page type in stable display order (filter control + breakdown
 * table). Derived from the API-contract zod enum (the same derivation as
 * `lib/prompts/forms.ts` `intentValues`) so the vocabulary has exactly one
 * frontend owner.
 */
export const PAGE_KINDS: readonly PageKind[] = pageKindSchema.options;

/** Humanized label per page type — the one shared mapping. */
const PAGE_KIND_LABELS: Record<PageKind, string> = {
  homepage: 'Homepage',
  article: 'Article',
  editorial_index: 'Editorial index',
  product: 'Product',
  category: 'Category',
  pricing: 'Pricing',
  docs: 'Docs',
  faq: 'FAQ',
  about_contact: 'About / Contact',
  service: 'Service',
  local: 'Local',
  guide: 'Guide',
  how_to: 'How-to',
  listicle: 'Listicle',
  comparison: 'Comparison',
  alternative: 'Alternative',
  case_study_review: 'Case Study / Review',
  trust_policy: 'Trust / Policy',
  other: 'Other',
};

/**
 * Display label for a page type. An unknown value (a vocabulary the frontend
 * has not caught up with) falls back to sentence case instead of rendering
 * blank — the same defensive fallback `issueTitle` applies to blank titles.
 */
export function pageKindLabel(pageKind: string): string {
  return isPageKind(pageKind) ? PAGE_KIND_LABELS[pageKind] : sentenceCaseStatus(pageKind);
}

function isPageKind(value: string): value is PageKind {
  return Object.hasOwn(PAGE_KIND_LABELS, value);
}

/** One display row of the dashboard per-page-kind score breakdown. */
export type PageKindScoreRow = PageKindScoreSummary & { page_kind: string };

/**
 * Order a `score_summary.by_page_kind` map for display: the `PAGE_KINDS`
 * order first, then any unknown types alphabetically — stable and
 * deterministic, never dependent on the API's map insertion order.
 */
export function byPageKindRows(
  byPageKind: Record<string, PageKindScoreSummary>,
): PageKindScoreRow[] {
  const rank = new Map<string, number>(PAGE_KINDS.map((type, index) => [type, index]));
  return Object.entries(byPageKind)
    .map(([page_kind, scores]) => ({ page_kind, ...scores }))
    .sort((a, b) => {
      const aRank = rank.get(a.page_kind) ?? PAGE_KINDS.length;
      const bRank = rank.get(b.page_kind) ?? PAGE_KINDS.length;
      return aRank === bRank ? a.page_kind.localeCompare(b.page_kind) : aRank - bRank;
    });
}
