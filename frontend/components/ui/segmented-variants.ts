import { cva } from 'class-variance-authority';

// One control height (32) for every segment; the group is a row of segments
// on the surface it sits on, with no track fill. The selected segment is a
// filled pill, the one selected face every tab, segment and navigation row
// shares (owner, 2026-11-04: active states are buttons, not underlines).
export const segmentedTrackVariants = cva(
  // `segmented-track` is a marker only (the geometry census measures it).
  'segmented-track inline-flex max-w-full overflow-x-auto h-[var(--control-md)] items-center gap-0.5',
);

export const segmentedItemVariants = cva(
  // A segment is a control, so it sets control text (14), not badge text.
  'focus-ring type-control shrink-0 inline-flex h-[var(--control-md)] items-center justify-center rounded-md px-[var(--tab-pad-x)] whitespace-nowrap transition-[background-color,color] disabled:cursor-not-allowed disabled:text-ink-muted',
  {
    variants: {
      selected: {
        true: 'bg-surface-sunken text-ink enabled:active:bg-surface-sunken',
        false:
          'text-ink-secondary enabled:hover:bg-surface-sunken enabled:hover:text-ink enabled:active:bg-surface-sunken',
      },
    },
    defaultVariants: { selected: false },
  },
);
