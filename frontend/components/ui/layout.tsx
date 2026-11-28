import type { ComponentPropsWithRef, ElementType } from 'react';

import { cn } from '@/lib/utils';

const STACK_GAP = {
  section: 'gap-section',
  card: 'gap-card',
  workspace: 'gap-workspace',
  compact: 'gap-compact',
  group: 'gap-group',
  loose: 'gap-loose',
  choices: 'gap-x-loose gap-y-item',
  'page-top': 'gap-page-top',
  item: 'gap-item',
  tight: 'gap-tight',
  none: 'gap-0',
} as const;

const PAD_TOP = {
  'flow-gap': 'pt-flow-gap',
} as const;

type Pad = Readonly<{ top?: keyof typeof PAD_TOP }>;

type StackGap = keyof typeof STACK_GAP;

const STACK_ALIGN = {
  stretch: undefined,
  start: 'justify-items-start',
  center: 'justify-items-center',
  end: 'justify-items-end',
} as const;

type StackAlign = keyof typeof STACK_ALIGN;

const STACK_LIST = {
  none: undefined,
  plain: 'list-none',
  decimal: 'list-inside list-decimal',
  disc: 'list-inside list-disc',
} as const;

const BOX = {
  auto: undefined,
  shrink: 'min-w-0',
  fill: 'min-w-0 flex-1',
  fixed: 'shrink-0',
  fit: 'w-fit max-w-full',
  'fixed-full': 'max-w-full shrink-0',
  line: 'h-5 phone:h-auto',
  target: 'min-h-target',
  end: 'ms-auto',
  scroll: 'max-h-64 overflow-y-auto overscroll-contain',
} as const;

export type Box = keyof typeof BOX;

const STACK_CONTENT = {
  stretch: undefined,
  start: 'content-start',
} as const;

export function Stack({
  as,
  gap = 'compact',
  align = 'stretch',
  list = 'none',
  box = 'auto',
  content = 'stretch',
  inset = false,
  pad,
  hideEmpty = false,
  shrinkTrack = false,
  anchor = false,
  children,
  ...props
}: Readonly<
  Omit<ComponentPropsWithRef<'div'>, 'className' | 'style'> & {
    as?: ElementType;
    gap?: StackGap;
    align?: StackAlign;
    list?: keyof typeof STACK_LIST;
    box?: Box;
    content?: keyof typeof STACK_CONTENT;
    inset?: boolean;
    pad?: Pad;
    hideEmpty?: boolean;
    shrinkTrack?: boolean;
    anchor?: boolean;
  }
>) {
  const Component = as ?? 'div';
  return (
    <Component
      {...props}
      className={cn(
        'grid',
        STACK_GAP[gap],
        STACK_ALIGN[align],
        STACK_LIST[list],
        BOX[box],
        STACK_CONTENT[content],
        inset && 'p-4',
        pad?.top && PAD_TOP[pad.top],
        hideEmpty && 'empty:hidden',
        shrinkTrack && 'grid-cols-1',
        anchor && 'group scroll-mt-4',
      )}
    >
      {children}
    </Component>
  );
}

const INLINE_GAP = {
  workspace: 'gap-workspace',
  compact: 'gap-compact',
  group: 'gap-group',
  loose: 'gap-loose',
  wide: 'gap-6',
  item: 'gap-item',
  tight: 'gap-tight',
  none: 'gap-0',
  meta: 'gap-x-loose gap-y-tight',
} as const;

type InlineGap = keyof typeof INLINE_GAP;

const INLINE_ALIGN = {
  center: 'items-center',
  start: 'items-start',
  end: 'items-end',
  baseline: 'items-baseline',
  stretch: 'items-stretch',
} as const;

type InlineAlign = keyof typeof INLINE_ALIGN;

const INLINE_JUSTIFY = {
  start: undefined,
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
} as const;

type InlineJustify = keyof typeof INLINE_JUSTIFY;

const WRAPPING_GAPS: ReadonlySet<InlineGap> = new Set(['meta']);

export function Inline({
  as,
  gap = 'item',
  align = 'center',
  justify = 'start',
  wrap,
  box = 'auto',
  inline = false,
  nowrap = false,
  stackBelow,
  showFrom,
  hideEmpty = false,
  children,
  ...props
}: Readonly<
  Omit<ComponentPropsWithRef<'div'>, 'className' | 'style'> & {
    as?: ElementType;
    gap?: InlineGap;
    align?: InlineAlign;
    justify?: InlineJustify;
    wrap?: boolean | 'phone';
    box?: Box;
    inline?: boolean;
    nowrap?: boolean;
    stackBelow?: 'desktop';
    showFrom?: 'desktop';
    hideEmpty?: boolean;
  }
>) {
  const Component = as ?? 'div';
  const wraps = wrap ?? WRAPPING_GAPS.has(gap);
  return (
    <Component
      {...props}
      className={cn(
        'flex min-w-0',
        INLINE_ALIGN[align],
        INLINE_JUSTIFY[justify],
        wraps === 'phone' ? 'phone:flex-wrap' : wraps && 'flex-wrap',
        INLINE_GAP[gap],
        BOX[box],
        inline && 'inline-flex',
        nowrap && 'whitespace-nowrap',
        stackBelow && 'desktop:flex-row desktop:items-center flex-col items-stretch',
        showFrom && 'desktop:flex hidden',
        hideEmpty && 'empty:hidden',
      )}
    >
      {children}
    </Component>
  );
}

const COLUMN_TEMPLATE = {
  'label-value': 'grid-cols-label-value phone:grid-cols-1',
  'fields-action': 'grid-cols-[1fr_1fr_auto]',
  'body-field': 'grid-cols-[minmax(0,1fr)_96px]',
  choices: 'grid-cols-[auto_auto] justify-start',
  'rail-panel': 'desktop:grid-cols-label-value',
  'halves-desktop': 'desktop:grid-cols-2',
  two: 'grid-cols-2',
  record: 'column-split:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]',
} as const;

type ColumnTemplate = keyof typeof COLUMN_TEMPLATE;

export function Columns({
  as,
  template,
  gap = 'compact',
  align = 'stretch',
  children,
  ...props
}: Readonly<
  Omit<ComponentPropsWithRef<'div'>, 'className' | 'style'> & {
    as?: ElementType;
    template: ColumnTemplate;
    gap?: StackGap;
    align?: InlineAlign;
  }
>) {
  const Component = as ?? 'div';
  return (
    <Component
      {...props}
      data-columns={template}
      className={cn(
        'grid min-w-0 grid-cols-1',
        COLUMN_TEMPLATE[template],
        STACK_GAP[gap],
        INLINE_ALIGN[align],
      )}
    >
      {children}
    </Component>
  );
}
