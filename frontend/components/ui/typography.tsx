import {
  createElement,
  type ComponentPropsWithoutRef,
  type ComponentPropsWithRef,
  type Ref,
} from 'react';

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
  'caption-mono': 'text-caption font-mono',
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

const SECONDARY_ROLES: ReadonlySet<TypeRole> = new Set([
  'caption',
  'caption-strong',
  'caption-mono',
]);
type TextTag =
  | 'span'
  | 'b'
  | 'output'
  | 'legend'
  | 'pre'
  | 'label'
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

const TEXT_WRAP = {
  anywhere: 'wrap-anywhere',
  all: 'break-all',
  nowrap: 'whitespace-nowrap',
  truncate: 'truncate',
  lines: 'whitespace-pre-line',
} as const;

const TEXT_BOX = {
  fill: 'min-w-0 flex-1',
  shrink: 'min-w-0',
  fixed: 'shrink-0',
  row: 'flex min-w-0',
  inline: 'inline',
  prose: 'max-w-prose',
  clip: 'min-w-0 overflow-hidden',
} as const;

export function Text({
  variant,
  tone = SECONDARY_ROLES.has(variant) ? 'ink-2' : 'ink',
  as: Tag = 'span',
  numeric = false,
  wrap,
  box,
  focusable = false,
  children,
  ...props
}: Readonly<
  Omit<ComponentPropsWithRef<'span'>, 'className' | 'style' | 'ref'> & {
    ref?: Ref<HTMLElement>;
    variant: TypeRole;
    tone?: TextTone;
    as?: TextTag;
    numeric?: boolean;
    wrap?: keyof typeof TEXT_WRAP;
    box?: keyof typeof TEXT_BOX;
    focusable?: boolean;
  }
>) {
  const className = cn(
    ROLE_CLASSES[variant],
    TONE_CLASSES[tone],
    numeric && 'tabular-nums',
    wrap && TEXT_WRAP[wrap],
    box && TEXT_BOX[box],
    focusable && 'focus-ring',
  );
  return createElement(Tag, { ...props, className }, children);
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
