import {
  createElement,
  type ComponentPropsWithoutRef,
  type ComponentPropsWithRef,
  type ReactNode,
  type Ref,
} from 'react';

import { cn } from '@/lib/utils';
import { TEXT_TONE_CLASS, type TextTone } from '@/components/ui/text-role';

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

type TypeRole = keyof typeof ROLE_CLASSES;

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
  words: 'break-words',
  balance: 'text-balance',
  nowrap: 'whitespace-nowrap',
  truncate: 'truncate',
  lines: 'whitespace-pre-line',
  pre: 'whitespace-pre-wrap',
  'pre-anywhere': 'whitespace-pre-wrap wrap-anywhere',
} as const;

const TEXT_BOX = {
  block: 'block',
  fit: 'w-fit',
  fill: 'min-w-0 flex-1',
  shrink: 'min-w-0',
  fixed: 'shrink-0',
  row: 'flex min-w-0',
  inline: 'inline',
  prose: 'max-w-prose',
  clip: 'min-w-0 overflow-hidden',
  stretch: 'min-w-0 justify-self-stretch',
  scroll: 'max-w-full overflow-x-auto',
  indent: 'ps-6',
  meta: 'flex h-6 items-center',
  'fill-row': 'flex min-w-0 flex-1',
  trail: 'min-w-0 ps-1',
} as const;

const TEXT_ALIGN = {
  start: undefined,
  end: 'text-end',
  center: 'text-center',
} as const;

export function Text({
  variant,
  tone = SECONDARY_ROLES.has(variant) ? 'ink-2' : 'ink',
  as: Tag = 'span',
  numeric = false,
  wrap,
  box,
  focusable = false,
  align = 'start',
  hideOnPhone = false,
  hideOnDesktop = false,
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
    align?: keyof typeof TEXT_ALIGN;
    hideOnPhone?: boolean;
    hideOnDesktop?: boolean;
  }
>) {
  const className = cn(
    ROLE_CLASSES[variant],
    tone && TEXT_TONE_CLASS[tone],
    numeric && 'tabular-nums',
    wrap && TEXT_WRAP[wrap],
    box && TEXT_BOX[box],
    focusable && 'focus-ring',
    TEXT_ALIGN[align],
    hideOnPhone && 'phone:hidden',
    hideOnDesktop && 'desktop:hidden',
  );
  return createElement(Tag, { ...props, className }, children);
}

export function CopyStack({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="text-body text-ink max-w-copy flex min-w-0 flex-col gap-2">{children}</div>
  );
}

export function CodeToken({ children }: Readonly<{ children: string }>) {
  return (
    <code
      data-code-token=""
      className="text-code text-ink bg-well rounded-control min-w-0 px-2 py-1 font-mono wrap-anywhere"
    >
      {children}
    </code>
  );
}

export function InlineFigure({
  children,
  ...props
}: Readonly<Omit<ComponentPropsWithoutRef<'span'>, 'className' | 'style'>>) {
  return (
    <span {...props} className="tabular-nums">
      {children}
    </span>
  );
}
