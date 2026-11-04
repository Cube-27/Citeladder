import { cn } from '@/lib/utils';

/**
 * Tag — the small inline chip that labels a value: a provenance marker, a
 * count, a property name. Six of these were hand-rolled with three different
 * fills, so the same marker read differently on each screen. It is static: the
 * one badge height (20) sets the minimum, with no focus or hover. Anything the
 * user clicks is a 32px control, never a tag.
 */
const TAG_TONE = {
  blue: 'bg-surface text-ink shadow-xs',
  purple: 'bg-surface text-ink shadow-xs',
  green: 'bg-surface text-ink shadow-xs',
  moss: 'bg-surface text-ink shadow-xs',
  red: 'bg-surface text-ink shadow-xs',
  orange: 'bg-surface text-ink shadow-xs',
  amber: 'bg-surface text-ink shadow-xs',
  teal: 'bg-surface text-ink shadow-xs',
  yellow: 'bg-surface text-ink shadow-xs',
  neutral: 'bg-surface text-ink shadow-xs',
  well: 'bg-surface-sunken text-ink-secondary',
  outline: 'bg-surface text-ink-secondary border border-line',
  accent: 'bg-accent-soft text-accent-ink',
} as const;

export type TagTone = keyof typeof TAG_TONE;

export function tagClasses(tone: TagTone = 'well', className?: string) {
  return cn(
    'type-badge inline-flex min-h-[var(--badge-height-sm)] max-w-full items-center gap-1 rounded-full px-2 py-0.5',
    TAG_TONE[tone],
    className,
  );
}
