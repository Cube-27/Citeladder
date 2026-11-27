import { cn } from '@/lib/utils';

const TEXT_ROLE = {
  caption: 'text-caption font-sans',
  'caption-strong': 'text-caption-strong font-sans',
  'caption-mono': 'text-caption font-mono',
  code: 'text-code font-mono',
  body: 'text-body font-sans',
  'body-lg': 'text-body-lg font-sans',
  label: 'text-label font-sans',
  heading: 'text-heading font-sans',
  title: 'text-title font-display',
  'page-title': 'text-page-title font-sans',
  figure: 'text-figure font-figure tabular-nums',
} as const;

export type TextRole = keyof typeof TEXT_ROLE;

export const TEXT_TONE_CLASS = {
  ink: 'text-ink',
  'ink-2': 'text-ink-2',
  'accent-text': 'text-accent-text',
  positive: 'text-positive',
  negative: 'text-negative',
  warning: 'text-warning',
  info: 'text-info',
  placeholder: 'text-ink-placeholder',
} as const;

export type TextTone = keyof typeof TEXT_TONE_CLASS;

const SECONDARY_ROLES: ReadonlySet<TextRole> = new Set([
  'caption',
  'caption-strong',
  'caption-mono',
]);

export const roleTone = (role: TextRole): TextTone => (SECONDARY_ROLES.has(role) ? 'ink-2' : 'ink');

export const textRoleClass = (role: TextRole, tone: TextTone = roleTone(role)) =>
  cn(TEXT_ROLE[role], TEXT_TONE_CLASS[tone]);
