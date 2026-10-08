/** Frozen persisted evidence shared by the PR7 detector foundation. */
export type CitationEvidence = {
  domain: string;
  url: string;
  title: string;
  is_owned: boolean;
  matched_competitor: string | null;
};
export type AnalysisEvidence = {
  analysis_id: string;
  prompt_index: number;
  logical_engine: string;
  owned_citation_count: number;
  brand_mentioned: boolean;
  competitor_names: string[];
  citations: CitationEvidence[];
  artifact_id: string | null;
  entity_assessments: Record<string, unknown>[];
};
export type PromptSnapshotEvidence = {
  prompt_index: number;
  prompt_id: string | null;
  text: string;
  theme: string;
  intent: string;
  buyer_stage: string;
  prompt_intent: string;
  snapshot_id: string | null;
};
export type VisibilityEvidence = {
  audit_id: string;
  analyses: AnalysisEvidence[];
  prompt_snapshots: PromptSnapshotEvidence[];
  owned_domains: string[];
};
export type SiteEvidence = {
  crawl_id: string;
  /** Whether the issue load hit its cap. */
  truncated: boolean;
  issues: {
    issue_id: string;
    rule_id: string;
    severity: string;
    category: string;
    site_url_id: string;
    evidence: Record<string, unknown> | null;
    finding_class: string;
  }[];
  urls: { site_url_id: string; normalized_url: string }[];
  coverage: Record<string, unknown>;
  limitations: string[];
};
export type DetectorHit = {
  rule_id: string;
  target_key: string;
  target_prompt_id: string | null;
  target_url: string | null;
  target_theme: string | null;
  evidence: Record<string, unknown>;
  source_analysis_ids: string[];
  source_issue_ids: string[];
  source_metric_ids: string[];
  value_factor: number;
  gap_factor: number;
};
type PageEntityEvidence = {
  entity_kind: string;
  entity_name: string;
  presence: string;
  match_method: string;
  match_count: number;
  passages: string[];
};
export type SourcePageEvidence = {
  url_hash: string;
  canonical_url: string;
  registrable_domain: string;
  page_format: string;
  page_format_method: string | null;
  inspection_state: string;
  inspection_reason: string | null;
  snapshot_id: string | null;
  extracted_chars: number;
  sufficient_coverage: boolean;
  title: string;
  headings: string[];
  outbound_domains: string[];
  content_hash: string | null;
  entities: PageEntityEvidence[];
  prior: {
    snapshot_id: string;
    brand_present: boolean;
    brand_match_count: number;
    present_competitors: string[];
    content_hash: string | null;
  } | null;
  roster_current: boolean;
  source_class: string | null;
  recurrence_count: number;
  answer_count: number;
  prompt_indices: number[];
  themes: string[];
  analysis_ids: string[];
  answer_competitors: string[];
  requested: boolean;
};
export type EarnedPageEvidence = {
  pages: SourcePageEvidence[];
  owned_domains: string[];
  eligible_answers: number;
  inspected_pages: number;
  total_pages: number;
};
