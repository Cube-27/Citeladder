import { cva } from 'class-variance-authority';

/**
 * Shared visual contract for menus and custom listboxes. The overlay shadow
 * draws the hairline edge; the transparent border keeps the box geometry and
 * becomes the visible edge in forced colours, where shadows are dropped.
 */
export const menuPanelClasses =
  'menu-panel border-transparent bg-surface shadow-pop z-modal overflow-hidden rounded-lg border p-1 focus-ring';

export const menuItemVariants = cva(
  'text-ink hover:bg-surface-sunken data-[highlighted]:bg-surface-sunken active:bg-surface-sunken data-[active=true]:bg-surface-sunken data-[state=checked]:bg-surface-sunken data-[active=true]:hover:bg-surface-sunken data-[state=checked]:hover:bg-surface-sunken data-[active=true]:data-[highlighted]:bg-surface-sunken data-[state=checked]:data-[highlighted]:bg-surface-sunken relative flex min-h-[var(--menu-item-height)] cursor-pointer items-center gap-2 rounded-md py-1 type-control transition-colors focus-ring data-[disabled]:pointer-events-none data-[disabled]:bg-surface-sunken data-[disabled]:text-ink-muted data-[state=checked]:data-[disabled]:bg-surface-sunken data-[active=true]:data-[disabled]:bg-surface-sunken',
  {
    variants: {
      inset: {
        true: 'ps-8 pe-2',
        false: 'px-2',
      },
      selected: {
        true: 'bg-surface-sunken text-ink hover:bg-surface-sunken',
        false: null,
      },
    },
    defaultVariants: {
      inset: false,
      selected: false,
    },
  },
);
