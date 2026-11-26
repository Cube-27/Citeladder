import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

const TEXT_ROLES = {
  display: 'type-display',
  title: 'type-title',
  heading: 'type-heading',
  subheading: 'type-subheading',
  body: 'type-body',
  label: 'type-label',
  prose: 'type-prose',
  caption: 'type-caption',
  captionStrong: 'type-caption-strong',
  figureXl: 'type-figure-xl',
  figure: 'type-figure',
  code: 'type-code',
  emphasis: 'font-emphasis',
  bodyLg: 'text-body-lg font-sans text-ink',
  pageTitle: 'type-page-title',
} as const;

export type TextRole = keyof typeof TEXT_ROLES;

export function textRole(role: TextRole, className?: string) {
  return cn(TEXT_ROLES[role], className);
}

const ROLE_CLASSES = {
  caption: 'text-caption font-sans',
  'caption-strong': 'text-caption-strong font-sans',
  code: 'text-code font-mono',
  eyebrow: 'text-eyebrow font-sans',
  body: 'text-body font-sans',
  'body-lg': 'text-body-lg font-sans',
  label: 'text-label font-sans',
  heading: 'text-heading font-sans',
  prose: 'text-prose font-sans',
  title: 'text-title font-display',
  'page-title': 'text-page-title font-sans',
  figure: 'text-figure font-sans',
  'figure-xl': 'text-figure-xl font-sans',
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
} as const;

type TypeRole = keyof typeof ROLE_CLASSES;
type TextTone = keyof typeof TONE_CLASSES;

const SECONDARY_ROLES: ReadonlySet<TypeRole> = new Set(['caption', 'caption-strong', 'eyebrow']);
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
