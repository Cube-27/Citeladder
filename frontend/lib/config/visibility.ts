/** Visibility presentation choices; calculations stay in the analysis domain. */
export const PROMPT_ANALYSIS_PAGE_SIZE = 20;
export const VISIBILITY_METRICS = [
  { value: 'brand_mention_rate', label: 'Visibility' },
  { value: 'sov', label: 'Share of voice' },
  { value: 'owned_citation_rate', label: 'Owned citation rate' },
] as const;

export const PROMPT_ANALYSIS_MODES = [
  { value: 'low', label: 'Low visibility' },
  { value: 'drops', label: 'Biggest drops' },
  { value: 'gains', label: 'Biggest gains' },
  { value: 'strongest', label: 'Strongest' },
] as const;

/** Mentions & Citations reads either the sites cited, or the answers themselves. */
export const SOURCE_MODES: readonly { value: 'sources' | 'answers'; label: string }[] = [
  { value: 'sources', label: 'Cited sources' },
  { value: 'answers', label: 'Answers' },
] as const;

export const ANSWER_OUTCOMES = [
  { value: 'all', label: 'All answers' },
  { value: 'brand_absent', label: 'Brand absent' },
  { value: 'uncited', label: 'Brand mentioned without owned citation' },
] as const;
