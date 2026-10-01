import { cva } from 'class-variance-authority';

/** Shared controls use action roles and explicit hairline boundaries. */
export const buttonVariants = cva(
  'focus-ring type-control inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] no-underline transition-[transform,background-color,color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] active:scale-[0.98] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-disabled disabled:text-muted disabled:border-border-subtle aria-disabled:pointer-events-none aria-disabled:bg-disabled aria-disabled:text-muted aria-disabled:border-border-subtle aria-pressed:bg-selected aria-pressed:text-foreground aria-pressed:not-disabled:hover:bg-selected data-[state=open]:bg-selected data-[state=open]:text-foreground data-[state=open]:not-disabled:hover:bg-selected',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-accent-fg border border-transparent not-disabled:hover:bg-accent-hover active:bg-accent-active',
        accent:
          'bg-accent-soft text-accent-text border border-accent-border not-disabled:hover:bg-accent not-disabled:hover:text-accent-fg active:bg-accent-hover',
        secondary:
          'bg-input text-foreground border border-border not-disabled:hover:bg-hover not-disabled:hover:border-border-strong active:bg-active',
        tonal:
          'bg-accent-subtle text-accent-text border border-border not-disabled:hover:bg-accent-border active:bg-accent-border',
        neutral:
          'bg-background-alt text-foreground shadow-none not-disabled:hover:bg-hover active:bg-active',
        ghost:
          'bg-transparent text-secondary shadow-none not-disabled:hover:bg-hover not-disabled:hover:text-foreground active:bg-active',
        destructive:
          'bg-danger-solid text-danger-fg shadow-none not-disabled:hover:bg-danger-solid-hover active:bg-danger-solid-hover',
        destructiveGhost:
          'bg-transparent text-danger-text shadow-none not-disabled:hover:bg-danger-bg active:bg-danger-bg',
      },
      size: {
        sm: 'h-[var(--control-height-sm)] px-3',
        md: 'h-[var(--control-height-md)] px-3',
        lg: 'h-[var(--control-height-lg)] px-4',
        marketing: 'min-h-12 px-5 text-base',
        icon: 'size-[var(--control-height-md)] px-0',
        iconRound: 'size-[var(--control-height-md)] rounded-full px-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);
