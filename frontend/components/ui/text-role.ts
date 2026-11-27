import { cn } from '@/lib/utils';

const TEXT_ROLES = {
  display: 'text-display font-display text-ink',
  title: 'text-title font-display text-ink',
  heading: 'text-heading text-ink',
  subheading: 'text-label text-ink',
  body: 'text-body text-ink',
  label: 'text-label text-ink',
  prose: 'text-prose text-ink',
  caption: 'text-caption text-ink-2',
  captionStrong: 'text-caption-strong text-ink-2',
  figureXl: 'text-figure-xl font-figure tabular-nums text-ink',
  figure: 'text-figure font-figure tabular-nums text-ink',
  code: 'text-code font-mono text-ink',
  emphasis: 'font-emphasis',
  bodyLg: 'text-body-lg font-sans text-ink',
  pageTitle: 'text-page-title text-ink',
} as const;

export type TextRole = keyof typeof TEXT_ROLES;

export function textRole(role: TextRole, className?: string) {
  return cn(TEXT_ROLES[role], className);
}

const TONE_CLASSES = {
  ink: 'text-ink',
  'ink-2': 'text-ink-2',
  'accent-text': 'text-accent-text',
  positive: 'text-positive',
  negative: 'text-negative',
  warning: 'text-warning',
  info: 'text-info',
  placeholder: 'text-ink-placeholder',
} as const;

export type TextTone = keyof typeof TONE_CLASSES;

export function toneClass(tone: TextTone | undefined) {
  return tone ? TONE_CLASSES[tone] : undefined;
}
