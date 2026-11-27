import type { ButtonHTMLAttributes, ReactElement, Ref } from 'react';

import {
  textRoleClass,
  TEXT_TONE_CLASS,
  type TextRole,
  type TextTone,
} from '@/components/ui/text-role';
import { pressableRowClasses } from '@/components/ui/open-row-skeleton';
import { cn } from '@/lib/utils';

export type PressableProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'style'
> & {
  ref?: Ref<HTMLButtonElement>;
  tone?: TextTone;
  text?: TextRole;
  numeric?: boolean;
  look?: keyof typeof LOOK | SelectableLook;
  selected?: boolean;
  anchor?: boolean;
  box?: keyof typeof BOX;
};

const BOX = {
  auto: 'w-auto',
  'auto-start': 'w-auto text-start',
  'auto-end': 'w-auto text-right',
  start: 'text-start',
  overlay: 'absolute inset-0',
  block: 'block min-w-0',
  row: 'flex w-auto max-w-full min-w-0',
  inline: 'inline-flex w-auto',
  target: 'inline-flex min-h-target w-auto items-center',
  'target-shrink': 'min-h-target w-auto min-w-0',
  'target-square': 'min-h-target w-auto min-w-target text-center',
} as const;

export const ROW_FACE = {
  base: 'relative rounded-control transition-tint duration-fast ease-standard',
  rest: 'text-ink-2 hover:overlay-hover hover:text-ink active:overlay-pressed',
  selected: 'overlay-selected text-ink',
} as const;

const LOOK = {
  plain: undefined,
  jump: 'underline decoration-1 underline-offset-3 decoration-control-line hover:decoration-current',
  square:
    'enabled:hover:bg-state-fill enabled:active:bg-state-fill-hover size-control-md inline-flex items-center justify-center',
  chip: 'hover:text-ink rounded-mark inline-flex w-auto min-w-0 items-center gap-1',
  more: 'border-rule hover:overlay-hover hover:text-ink flex h-10 items-center justify-center border-t',
  'tree-row': 'hover:overlay-hover flex h-10 items-center gap-2 px-2',
  disclosure: cn(ROW_FACE.base, ROW_FACE.rest, pressableRowClasses, 'min-h-10'),
} as const;

const DAY = 'inline-flex size-control-md items-center justify-center transition-colors';

const SELECTABLE_LOOK = {
  day: {
    rest: cn(DAY, 'enabled:hover:bg-state-fill enabled:active:bg-state-fill-hover'),
    selected: cn(
      DAY,
      'bg-primary text-on-primary enabled:hover:bg-primary-hover enabled:active:bg-primary-hover',
    ),
  },
  option: {
    rest: cn(ROW_FACE.base, ROW_FACE.rest, pressableRowClasses, 'disabled:pointer-events-none'),
    selected: cn(
      ROW_FACE.base,
      ROW_FACE.selected,
      pressableRowClasses,
      'disabled:pointer-events-none',
    ),
  },
} as const;

type SelectableLook = keyof typeof SELECTABLE_LOOK;

const isSelectable = (look: string): look is SelectableLook => Object.hasOwn(SELECTABLE_LOOK, look);

const lookClasses = (look: NonNullable<PressableProps['look']>, selected: boolean) =>
  isSelectable(look) ? SELECTABLE_LOOK[look][selected ? 'selected' : 'rest'] : LOOK[look];

function SlotMergedPressable({
  box,
  className: slotClass,
  type = 'button',
  tone,
  text,
  numeric = false,
  look = 'plain',
  selected = false,
  anchor = false,
  ref,
  ...props
}: Readonly<PressableProps & { className?: string }>) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'focus-ring w-full rounded-control text-left transition-[background-color] duration-fast ease-standard disabled:pointer-events-none disabled:bg-well disabled:text-ink-2 disabled:border-rule',
        text && textRoleClass(text),
        numeric && 'tabular-nums',
        lookClasses(look, selected),
        anchor && 'scroll-mt-4',
        tone && TEXT_TONE_CLASS[tone],
        box && BOX[box],
        slotClass,
      )}
      {...props}
    />
  );
}

export const Pressable: (props: Readonly<PressableProps>) => ReactElement = SlotMergedPressable;
