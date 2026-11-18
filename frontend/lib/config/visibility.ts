/** Visibility presentation choices; calculations stay in the analysis domain. */
export const VISIBILITY_METRICS = [
  { value: 'brand_mention_rate', label: 'Visibility' },
  { value: 'sov', label: 'Share of voice' },
  { value: 'avg_position', label: 'Position' },
  { value: 'owned_citation_rate', label: 'Owned citation rate' },
] as const;

/** What share of voice counts, behind the header that names it. */
export const SHARE_OF_VOICE_HINT =
  'Share of voice: your share of every brand mention across the brands you track.';

export const WIN_RATE_HINT =
  'Of the answers that name at least one brand you track, the share that name this brand first. A brand you do not track is not counted.';

/**
 * Classified mentions a perception breakdown row needs before it shows shares;
 * below it the row reads "too few classified", never a zero or a percentage.
 */
export const PERCEPTION_MIN_CLASSIFIED = 20;

/** Theme columns the competitor theme map shows: the most raised across brands. */
export const THEME_MAP_COLUMNS = 6;

export const ANSWER_OUTCOMES = [
  { value: 'all', label: 'All answers' },
  { value: 'brand_absent', label: 'Brand absent' },
  { value: 'uncited', label: 'Brand mentioned without owned citation' },
] as const;
