import type { ComponentPropsWithoutRef } from 'react';

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

const ROLE_CLASSES = {
  caption: 'text-caption font-sans',
  'caption-strong': 'text-caption-strong font-sans',
  code: 'text-code font-mono',
  body: 'text-body font-sans',
  'body-lg': 'text-body-lg font-sans',
  label: 'text-label font-sans',
  heading: 'text-heading font-sans',
  prose: 'text-prose font-sans',
  title: 'text-title font-display',
  'page-title': 'text-page-title font-sans',
  figure: 'text-figure font-figure',
  'figure-xl': 'text-figure-xl font-figure',
  display: 'text-display font-display',
} as const;

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

type TypeRole = keyof typeof ROLE_CLASSES;
export type TextTone = keyof typeof TONE_CLASSES;

export function toneClass(tone: TextTone | undefined) {
  return tone ? TONE_CLASSES[tone] : undefined;
}

const SECONDARY_ROLES: ReadonlySet<TypeRole> = new Set(['caption', 'caption-strong']);
type TextTag =
  | 'span'
  | 'p'
  | 'div'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'dt'
  | 'dd'
  | 'li'
  | 'strong'
  | 'code';

export function Text({
  variant,
  tone = SECONDARY_ROLES.has(variant) ? 'ink-2' : 'ink',
  as: Tag = 'span',
  numeric = false,
  children,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'span'>, 'className' | 'style'> & {
    variant: TypeRole;
    tone?: TextTone;
    as?: TextTag;
    numeric?: boolean;
  }
>) {
  return (
    <Tag
      {...props}
      className={cn(ROLE_CLASSES[variant], TONE_CLASSES[tone], numeric && 'tabular-nums')}
    >
      {children}
    </Tag>
  );
}

export function CodeToken({ children }: Readonly<{ children: string }>) {
  return (
    <code
      data-code-token=""
      className={textRole(
        'code',
        'bg-well min-w-0 rounded-control px-2 py-1 [overflow-wrap:anywhere]',
      )}
    >
      {children}
    </code>
  );
}

export function InlineFigure({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'span'>>) {
  return (
    <span {...props} className={cn('tabular-nums', className)}>
      {children}
    </span>
  );
}

export function Metric({
  children,
  className,
  ...props
}: Readonly<ComponentPropsWithoutRef<'span'>>) {
  return (
    <span {...props} className={textRole('figure', className)}>
      {children}
    </span>
  );
}
