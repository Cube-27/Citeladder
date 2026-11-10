/**
 * Content optimization policy: the content-angle refresh's window, bounds and
 * versions (docs/plans/content-optimization.md sections 1-2, CO3, CO4, CO15),
 * and the page fetch that starts a page document (phase 2, PR 1).
 */
import agentRuntime from './agent-runtime.json' with { type: 'json' };

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
  /**
   * The one-page fetch an `optimize_page` chat starts with (CO12). It goes
   * through Site Health's fetcher, so robots, hard exclusions, the operator
   * stop list and per-host pacing all apply; these bound only this fetch.
   */
  page_fetch: {
    /** The HTML converter's version, recorded on every snapshot. */
    extractor_version: 'page-document-1',
    /** Every snapshot ends in exactly one of these. */
    outcomes: ['fetched', 'blocked_robots', 'http_error', 'unsupported', 'failed'],
    /** Site Health acquisition codes that are a robots or access-control refusal. */
    blocked_robots_codes: ['robots_denied', 'robots_unavailable', 'access_blocked'],
    /** Site Health acquisition codes for a response the editor cannot use; any other failure is `failed`. */
    unsupported_codes: ['unsupported_content_type', 'response_too_large'],
    timeout_seconds: 20,
    /** The response bytes read on the wire and after decoding. */
    max_wire_bytes: 5_000_000,
    max_decoded_bytes: 10_000_000,
    /** The raw body kept on the snapshot; a longer body is cut and marked truncated. */
    snapshot_body_max_bytes: 2_000_000,
    /**
     * Fetch outcomes are recorded on the first attempt; a further attempt only
     * covers a failure to record them. A task that still fails leaves a
     * `failed` snapshot and a chat notice through its compensation.
     */
    max_attempts: 2,
    /**
     * Site Health rules that are judged from one page's HTML but read the
     * crawl's sitemap, so the fetch cannot re-judge them; they keep the crawl's
     * finding (content rules engine, L0).
     */
    site_context_rule_ids: [
      'technical.sitemap_canonical',
      'technical.sitemap_noindex',
      'technical.sitemap_redirect',
      'technical.sitemap_lastmod',
    ],
    /** The Site Health rule scope the fetch re-evaluates; site, cluster and graph rules need the crawl. */
    page_local_scope: 'page',
  },
  /**
   * Analyze a page on the Actions screen (CO6, phase 2 PR 4): the workflow its
   * chat starts, the chat's first message, and how many matching content
   * pages the picker lists at once (it searches for the rest).
   */
  analyze_page: {
    workflow_id: 'optimize_page',
    /** `{topic}` is the chosen topic's name; the prompts reach the Agent as context. */
    message: 'Improve this page so AI answers cite it for prompts about {topic}.',
    page_list_max: 50,
    /** Characters of the picker's search: a page address or title fragment. */
    search_max_chars: 200,
  },
  /**
   * A page document's caps equal the Agent's document caps, so `edit_document`
   * can always save a fetched page. A page whose Markdown is longer is
   * `unsupported` rather than cut.
   */
  page_document: {
    title_max_chars: agentRuntime.output_title_max_chars,
    body_max_chars: agentRuntime.output_body_max_chars,
    /** The JSON-LD blocks kept in the SEO fields; blocks past it are left out whole. */
    json_ld_max_chars: 20_000,
  },
} as const;
