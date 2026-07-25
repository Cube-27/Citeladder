/**
 * Site Health page-type vocabulary + presentation helpers (v2 P1) — PURE.
 *
 * The SINGLE shared mapping from the backend `page_type` classification
 * vocabulary to humanized labels — every badge, filter control, and the
 * dashboard per-type breakdown reads it from here (no duplicated maps).
 * No transport, no React.
 */
import { pageTypeSchema } from '@/lib/api/schemas';
import type { PageType, PageTypeScoreSummary } from '@/lib/api/types';
import { titleCaseStatus } from '@/lib/utils';

/**
 * Every page type in stable display order (filter control + breakdown
 * table). Derived from the API-contract zod enum (the same derivation as
 * `lib/prompts/forms.ts` `intentValues`) so the vocabulary has exactly one
 * frontend owner.
 */
export const PAGE_TYPES: readonly PageType[] = pageTypeSchema.options;

/** Humanized label per page type — the one shared mapping. */
export const PAGE_TYPE_LABELS: Record<PageType, string> = {
  homepage: 'Homepage',
  article: 'Article',
  product: 'Product',
  category: 'Category',
  pricing: 'Pricing',
  docs: 'Docs',
  faq: 'FAQ',
  about_contact: 'About / Contact',
  other: 'Other',
};

/**
 * Display label for a page type. An unknown value (a vocabulary the frontend
 * has not caught up with) falls back to title-casing instead of rendering
 * blank — the same defensive fallback `issueTitle` applies to blank titles.
 */
export function pageTypeLabel(pageType: string): string {
  return PAGE_TYPE_LABELS[pageType as PageType] ?? titleCaseStatus(pageType);
}

/** One display row of the dashboard per-page-type score breakdown. */
export type PageTypeScoreRow = PageTypeScoreSummary & { page_type: string };

/**
 * Order a `score_summary.by_page_type` map for display: the `PAGE_TYPES`
 * order first, then any unknown types alphabetically — stable and
 * deterministic, never dependent on the API's map insertion order.
 */
export function byPageTypeRows(
  byPageType: Record<string, PageTypeScoreSummary>,
): PageTypeScoreRow[] {
  const rank = new Map<string, number>(PAGE_TYPES.map((type, index) => [type, index]));
  return Object.entries(byPageType)
    .map(([page_type, scores]) => ({ page_type, ...scores }))
    .sort((a, b) => {
      const aRank = rank.get(a.page_type) ?? PAGE_TYPES.length;
      const bRank = rank.get(b.page_type) ?? PAGE_TYPES.length;
      return aRank === bRank ? a.page_type.localeCompare(b.page_type) : aRank - bRank;
    });
}

/**
 * One ranked matched-signal entry of the persisted classifier evidence —
 * `{ signal, page_type, weight, detail }` as the backend
 * `PageTypeAssessment.to_evidence()` emits it (detail already truncated
 * server-side).
 */
export type PageTypeEvidenceSignal = {
  signal: string;
  pageType: string;
  weight: number;
  detail: string;
};

/**
 * The parsed, display-ready classifier evidence for one analyzed page (the
 * per-URL detail "why this type?" disclosure payload).
 */
export type PageTypeEvidenceView = {
  classifierVersion: string;
  /** Name of the winning signal (`none` when nothing matched). */
  classifiedBy: string;
  /** What the structured-data signal alone would have suggested. */
  schemaSuggestedType: string | null;
  confidence: number;
  confidenceThreshold: number;
  signals: PageTypeEvidenceSignal[];
  /**
   * True when the schema-suggested type disagrees with the page's final
   * type — the disclosure highlights the conflict (signals 1–3 outrank the
   * schema claim by design).
   */
  schemaConflict: boolean;
};

/**
 * Narrow the untyped `page_type_evidence` record (zod `z.unknown()` values)
 * into the display view. Returns null for absent or malformed evidence — the
 * disclosure hides itself rather than rendering partial guesses. Malformed
 * signal entries are skipped individually so one bad entry cannot sink the
 * whole panel.
 *
 * `finalPageType` is the analysis's own `page_type`: the evidence dict
 * records the schema suggestion but not the final type, so the conflict flag
 * is derived here.
 */
export function readPageTypeEvidence(
  evidence: unknown,
  finalPageType: string | null,
): PageTypeEvidenceView | null {
  if (typeof evidence !== 'object' || evidence === null || Array.isArray(evidence)) {
    return null;
  }
  const record = evidence as Record<string, unknown>;
  const classifiedBy = typeof record.classified_by === 'string' ? record.classified_by : null;
  const confidence = typeof record.confidence === 'number' ? record.confidence : null;
  const confidenceThreshold =
    typeof record.confidence_threshold === 'number' ? record.confidence_threshold : null;
  if (classifiedBy === null || confidence === null || confidenceThreshold === null) {
    return null;
  }
  const signals: PageTypeEvidenceSignal[] = [];
  if (Array.isArray(record.signals)) {
    for (const raw of record.signals) {
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue;
      const entry = raw as Record<string, unknown>;
      if (
        typeof entry.signal !== 'string' ||
        typeof entry.page_type !== 'string' ||
        typeof entry.weight !== 'number'
      ) {
        continue;
      }
      signals.push({
        signal: entry.signal,
        pageType: entry.page_type,
        weight: entry.weight,
        detail: typeof entry.detail === 'string' ? entry.detail : '',
      });
    }
  }
  const schemaSuggestedType =
    typeof record.schema_suggested_type === 'string' ? record.schema_suggested_type : null;
  return {
    classifierVersion:
      typeof record.classifier_version === 'string' ? record.classifier_version : '',
    classifiedBy,
    schemaSuggestedType,
    confidence,
    confidenceThreshold,
    signals,
    schemaConflict:
      schemaSuggestedType !== null &&
      finalPageType !== null &&
      schemaSuggestedType !== finalPageType,
  };
}
