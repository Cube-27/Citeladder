import { cva } from 'class-variance-authority';

/** Shared filled controls use shadow rings; focus keeps its own outline. */
export const buttonVariants = cva(
  'focus-ring type-control inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md no-underline transition-[transform,background-color,color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] active:scale-[0.98] disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted disabled:border-line aria-disabled:pointer-events-none aria-disabled:bg-surface-sunken aria-disabled:text-ink-muted aria-disabled:border-line aria-pressed:bg-surface-sunken aria-pressed:text-ink aria-pressed:not-disabled:hover:bg-surface-sunken aria-pressed:disabled:bg-surface-sunken aria-pressed:disabled:text-ink-muted aria-disabled:aria-pressed:bg-surface-sunken aria-disabled:aria-pressed:text-ink-muted data-[state=open]:bg-surface-sunken data-[state=open]:text-ink data-[state=open]:not-disabled:hover:bg-surface-sunken data-[state=open]:disabled:bg-surface-sunken data-[state=open]:disabled:text-ink-muted',
  {
    variants: {
      variant: {
        primary:
          'control-raised bg-ink text-on-ink not-disabled:hover:bg-ink-hover active:bg-ink-hover',
        accent:
          'control-raised bg-surface text-ink not-disabled:hover:bg-surface-sunken active:bg-surface-sunken',
        secondary:
          'control-raised bg-surface text-ink not-disabled:hover:bg-surface-sunken active:bg-surface-sunken',
        tonal:
          'control-raised bg-surface text-ink not-disabled:hover:bg-surface-sunken active:bg-surface-sunken',
        neutral:
          'control-raised bg-surface text-ink not-disabled:hover:bg-surface-sunken active:bg-surface-sunken',
        ghost:
          'bg-transparent text-ink-secondary shadow-none not-disabled:hover:bg-surface-sunken not-disabled:hover:text-ink active:bg-surface-sunken',
        destructive:
          'control-raised bg-surface text-negative not-disabled:hover:bg-negative-soft active:bg-negative-soft',
        destructiveGhost:
          'bg-transparent text-negative shadow-none not-disabled:hover:bg-negative-soft active:bg-negative-soft',
      },
      // The product has one text button (`md`) and one icon button (`icon`),
      // both 32. `lg` (36) and `marketing` (44) are the public website and
      // the auth/onboarding flow's rungs only.
      size: {
        md: 'h-[var(--control-md)] px-3',
        lg: 'h-[var(--control-md)] px-4',
        marketing: 'min-h-[var(--control-lg)] px-5',
        icon: 'size-[var(--control-md)] px-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);
