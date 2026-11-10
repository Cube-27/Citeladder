/**
 * Content optimization policy: the content-angle refresh's window, bounds and
 * versions (docs/plans/content-optimization.md sections 1-2, CO3, CO4, CO15).
 */
export const contentOptimization = {
  /** The clustering and matching prompts; a change recomputes every derived part. */
  methodology_version: 'content-angles-1',
  /** The deterministic aggregates (counts, prompts, engines, owned coverage). */
  formula_version: 'content-gaps-1',
  /** Audits completed this many days before the newest one are in the window. */
  window_days: 30,
  /** A succeeded run older than this is no longer a gap source (read in PR 2). */
  max_source_age_days: 45,
  // Placeholders until real audits are measured (phase 1 plan, 1.7). A topic
  // below either bound can never raise a gap, so it is not clustered.
  min_citations: 3,
  min_domains: 2,
  /** The most-cited URLs per topic sent to the model; the rest are a limitation. */
  max_urls_per_topic: 60,
  /** Owned content pages the lexical prefilter offers the model per angle. */
  owned_candidates_per_angle: 8,
  /** Jaccard overlap of member URLs at which a new angle keeps an old lineage. */
  lineage_min_overlap: 0.5,
  /** Site Health page kinds that are content pages (CO15). */
  content_page_kinds: [
    'article',
    'guide',
    'how_to',
    'listicle',
    'comparison',
    'alternative',
    'case_study_review',
  ],
  /** Content pages read from the latest crawl, at most. */
  max_content_pages: 2000,
  /** Characters of a content page's main text the prefilter and the model read. */
  content_excerpt_chars: 2000,
  /** Characters of an angle label the model may return. */
  max_label_chars: 80,
  /**
   * The cited sources clustered (CO3): a citation qualifies by either list.
   * Competitor sites, plus editorial or publisher sites; never owned,
   * unintended, UGC, social, directories or marketplaces.
   */
  gap_sources: {
    classifications: ['competitor'],
    source_classes: ['competitor_owned', 'editorial_third_party'],
  },
  /** Calls per model step while the output fails to parse. */
  model_max_attempts: 2,
} as const;
