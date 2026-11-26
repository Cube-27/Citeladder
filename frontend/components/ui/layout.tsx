import type { ComponentPropsWithoutRef, ComponentPropsWithRef, ElementType } from 'react';

import { cn } from '@/lib/utils';

const STACK_GAP = {
  section: 'gap-section',
  workspace: 'gap-workspace',
  compact: 'gap-compact',
  item: 'gap-2',
  tight: 'gap-1',
  none: 'gap-0',
} as const;

export type StackGap = keyof typeof STACK_GAP;

const STACK_ALIGN = {
  stretch: undefined,
  start: 'justify-items-start',
  center: 'justify-items-center',
  end: 'justify-items-end',
} as const;

type StackAlign = keyof typeof STACK_ALIGN;

export function Stack({
  as,
  gap = 'compact',
  align = 'stretch',
  className,
  children,
  ...props
}: Readonly<
  ComponentPropsWithRef<'div'> & { as?: ElementType; gap?: StackGap; align?: StackAlign }
>) {
  const Component = as ?? 'div';
  return (
    <Component {...props} className={cn('grid', STACK_GAP[gap], STACK_ALIGN[align], className)}>
      {children}
    </Component>
  );
}

const INLINE_GAP = {
  workspace: 'gap-workspace',
  compact: 'gap-compact',
  item: 'gap-2',
  tight: 'gap-1',
  none: 'gap-0',
  meta: 'gap-x-4 gap-y-1',
  status: 'gap-x-2 gap-y-1',
} as const;

export type InlineGap = keyof typeof INLINE_GAP;

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

const WRAPPING_GAPS: ReadonlySet<InlineGap> = new Set(['meta', 'status']);

export function Inline({
  as,
  gap = 'item',
  align = 'center',
  justify = 'start',
  wrap,
  className,
  children,
  ...props
}: Readonly<
  ComponentPropsWithoutRef<'div'> & {
    as?: ElementType;
    gap?: InlineGap;
    align?: InlineAlign;
    justify?: InlineJustify;
    wrap?: boolean;
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
        wraps && 'flex-wrap',
        INLINE_GAP[gap],
        className,
      )}
    >
      {children}
    </Component>
  );
}

const COLUMN_TEMPLATE = {
  'label-value': 'grid-cols-label-value phone:grid-cols-1',
  'fields-action': 'grid-cols-fields-action',
  'lead-body-end': 'grid-cols-lead-body-end',
  'lead-body': 'grid-cols-lead-body',
  'body-end': 'grid-cols-body-end',
  'main-aside': 'column-wide:grid-cols-main-aside',
  'aside-main': 'column-wide:grid-cols-aside-main',
  pair: 'column-split:grid-cols-2',
  thirds: 'column-split:grid-cols-3',
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
        'grid grid-cols-1',
        COLUMN_TEMPLATE[template],
        STACK_GAP[gap],
        INLINE_ALIGN[align],
      )}
    >
      {children}
    </Component>
  );
}
