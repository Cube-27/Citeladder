import { cn } from '@/lib/utils';

export const TAG_FACE =
  'text-caption border border-transparent bg-state-selected text-ink-2 inline-flex min-h-tag max-w-full min-w-0 shrink-0 items-center gap-0.5 rounded-mark px-1.5 normal-nums whitespace-nowrap [[data-public-surface]_&]:px-2 [[data-public-surface]_&]:text-ink app:font-emphasis app:text-ink';

export const CHIP_FACE =
  'text-caption text-ink-2 inline-flex max-w-full min-w-0 items-center gap-1 rounded-mark border px-1 align-baseline no-underline';

export const CITATION_FACE =
  'bg-state-selected data-own:bg-accent-wash data-bare:ps-2 text-ink inline-flex min-h-control-sm max-w-full items-center gap-1 rounded-sm ps-1 pe-3 align-middle text-body no-underline';

const CITATION_PRESS = 'focus-ring hover:overlay-hover';

const HEADING_LINK_FACE =
  'text-ink inline-flex items-center gap-2 rounded-mark text-heading no-underline';

export const LINK_LOOK = {
  plain: undefined,
  'row-title':
    'focus-ring-inset text-label text-ink self-start no-underline before:absolute before:inset-0',
  'list-row':
    'focus-ring rounded-mark min-w-0 flex-1 truncate before:absolute before:inset-x-0 before:inset-y-0',
  crumb:
    'hover:text-ink focus-ring rounded-mark font-emphasis block min-h-6 max-w-68 min-w-6 truncate px-1 py-0.5 hover:underline',
  heading: cn(HEADING_LINK_FACE, 'group focus-ring'),
  tag: cn(TAG_FACE, 'hover:overlay-hover focus-ring align-middle no-underline'),
  citation: cn(CITATION_FACE, CITATION_PRESS),
  'source-chip': cn(
    CHIP_FACE,
    'border-transparent bg-state-hover text-ink hover:overlay-hover no-underline',
  ),
} as const;

export type LinkLook = keyof typeof LINK_LOOK;
