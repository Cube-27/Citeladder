import {
  createElement,
  type ComponentPropsWithoutRef,
  type ComponentPropsWithRef,
  type Ref,
} from 'react';

import { cn } from '@/lib/utils';
import { textRole, toneClass, type TextTone } from '@/components/ui/text-role';

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
  nowrap: 'whitespace-nowrap',
  truncate: 'truncate',
  lines: 'whitespace-pre-line',
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
  }
>) {
  const className = cn(
    ROLE_CLASSES[variant],
    toneClass(tone),
    numeric && 'tabular-nums',
    wrap && TEXT_WRAP[wrap],
    box && TEXT_BOX[box],
    focusable && 'focus-ring',
    TEXT_ALIGN[align],
    hideOnPhone && 'phone:hidden',
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
