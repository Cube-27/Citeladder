import { cva } from 'class-variance-authority';

export const segmentedTrackVariants = cva(
  'bg-track inline-flex max-w-full overflow-x-auto scroll-px-1 min-h-[var(--control-height-sm)] items-center gap-0.5 rounded-[calc(var(--radius-control)+2px)] p-0.5',
);

export const segmentedItemVariants = cva(
  'focus-ring type-badge shrink-0 inline-flex h-[calc(var(--control-height-sm)-4px)] items-center justify-center rounded-[var(--radius-control)] px-3 whitespace-nowrap transition-[background-color,color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      selected: {
        true: 'bg-selected shadow-selected text-foreground',
        false: 'text-muted enabled:hover:text-foreground',
      },
    },
    defaultVariants: { selected: false },
  },
);
