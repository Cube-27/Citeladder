import { cva } from 'class-variance-authority';

/** Shared controls use action roles and explicit hairline boundaries. */
export const buttonVariants = cva(
  'focus-ring type-control inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] no-underline transition-[transform,background-color,color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] active:scale-[0.98] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-75',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-accent-fg border border-transparent hover:bg-accent-hover active:bg-accent-active',
        accent:
          'bg-accent-soft text-accent-text border border-accent-border hover:bg-accent hover:text-accent-fg active:bg-accent-hover',
        secondary:
          'bg-input text-foreground border border-border hover:bg-background-alt hover:border-border-strong active:bg-well',
        tonal:
          'bg-accent-subtle text-accent-text border border-border hover:bg-accent-border active:bg-accent-border',
        neutral: 'bg-background-alt text-foreground shadow-none hover:bg-well active:bg-active',
        ghost:
          'bg-transparent text-secondary shadow-none hover:bg-background-alt hover:text-foreground active:bg-well',
        destructive:
          'bg-danger-solid text-danger-fg shadow-none hover:bg-danger-solid-hover active:bg-danger-solid-hover',
        destructiveGhost:
          'bg-transparent text-danger-text shadow-none hover:bg-danger-bg active:bg-danger-bg',
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
