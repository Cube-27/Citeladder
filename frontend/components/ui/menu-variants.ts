import { cva } from 'class-variance-authority';

/** Shared visual contract for menus and custom listboxes. */
export const menuPanelClasses =
  'menu-panel border-border bg-elevated/95 backdrop-blur-md shadow-elevated z-modal overflow-hidden rounded-[var(--radius-overlay)] border p-1 focus-ring';

export const menuItemVariants = cva(
  'text-foreground data-[highlighted]:bg-accent-soft data-[highlighted]:text-accent-text data-[active=true]:bg-accent-soft data-[active=true]:text-accent-text data-[state=checked]:bg-accent-soft data-[state=checked]:text-accent-text relative flex min-h-8 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] py-1 type-control transition-colors focus-ring data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
  {
    variants: {
      inset: {
        true: 'ps-8 pe-2',
        false: 'px-2',
      },
      selected: {
        true: 'bg-accent-soft text-accent-text',
        false: null,
      },
    },
    defaultVariants: {
      inset: false,
      selected: false,
    },
  },
);
