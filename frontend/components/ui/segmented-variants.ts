import { cva } from 'class-variance-authority';

export const segmentedTrackVariants = cva(
  'bg-background-alt inline-flex items-center gap-0 rounded-full p-1',
);

export const segmentedItemVariants = cva(
  'focus-ring rounded-full px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors',
  {
    variants: {
      selected: {
        true: 'bg-panel text-foreground',
        false: 'text-muted hover:text-foreground',
      },
    },
    defaultVariants: { selected: false },
  },
);
