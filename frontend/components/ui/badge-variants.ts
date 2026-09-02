/**
 * Badge token maps (§8). Each family maps a value → the colour of the badge's
 * status dot, plus the label's ink. No raw hex; all classes resolve to the
 * semantic Tailwind declarations in globals.css.
 *
 * One signal, one encoding. A badge used to carry a fill, a border, a dot and a
 * label — four ways of saying the same thing, and on a paper canvas that reads
 * as clutter. The dot now carries the family colour and the label carries the
 * meaning, so a dense table of badges stays quiet enough to scan.
 *
 * The dot class is a separate field rather than a `[&>span]:bg-*` variant on the
 * wrapper: a child selector matches ANY direct span, and several call sites wrap
 * their own label in one (prompt-table, measurement-context), which would paint
 * a block behind the text. Badge owns the dot element, so Badge applies the class.
 *
 * Families:
 *  - status:         success | warning | danger | info
 *  - sentiment:      positive | neutral | negative
 *  - classification: owned | competitor | third-party  (citation classification)
 *  - run-status:     draft | queued | running | analyzing | completed | partial | failed | cancelled
 *  - neutral:        the default chip
 */

export type BadgeTone = { label: string; dot: string };

export const statusBadge = {
  success: { label: 'text-secondary', dot: 'bg-success' },
  warning: { label: 'text-secondary', dot: 'bg-warning' },
  danger: { label: 'text-danger-text', dot: 'bg-danger' },
  info: { label: 'text-secondary', dot: 'bg-info' },
} as const satisfies Record<string, BadgeTone>;

export const sentimentBadge = {
  positive: { label: 'text-secondary', dot: 'bg-sentiment-positive' },
  neutral: { label: 'text-secondary', dot: 'bg-sentiment-neutral' },
  negative: { label: 'text-danger-text', dot: 'bg-sentiment-negative' },
} as const satisfies Record<string, BadgeTone>;

export const classificationBadge = {
  owned: { label: 'text-secondary', dot: 'bg-citation-owned' },
  competitor: { label: 'text-secondary', dot: 'bg-citation-competitor' },
  'third-party': { label: 'text-secondary', dot: 'bg-citation-third-party' },
} as const satisfies Record<string, BadgeTone>;

export const runStatusBadge = {
  draft: { label: 'text-muted', dot: 'bg-run-draft' },
  queued: { label: 'text-muted', dot: 'bg-run-queued' },
  running: { label: 'text-secondary', dot: 'bg-run-running' },
  paused: { label: 'text-muted', dot: 'bg-run-queued' },
  analyzing: { label: 'text-secondary', dot: 'bg-run-analyzing' },
  completed: { label: 'text-secondary', dot: 'bg-run-completed' },
  partial: { label: 'text-secondary', dot: 'bg-run-partial' },
  failed: { label: 'text-danger-text', dot: 'bg-run-failed' },
  cancelled: { label: 'text-muted', dot: 'bg-run-cancelled' },
} as const satisfies Record<string, BadgeTone>;

export const neutralBadge = { label: 'text-muted', dot: 'bg-border-strong' } as const;

export type StatusValue = keyof typeof statusBadge;
export type SentimentValue = keyof typeof sentimentBadge;
export type ClassificationValue = keyof typeof classificationBadge;
export type RunStatusValue = keyof typeof runStatusBadge;

/**
 * Shared shape/typography for every badge family — an unboxed dot-and-label
 * pair, not a chip. Casing comes from the call site so product nouns keep their
 * capitalization.
 */
export const badgeBase = 'inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium';
