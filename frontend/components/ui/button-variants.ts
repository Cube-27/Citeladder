import { cva } from 'class-variance-authority';

/**
 * Button CVA — token-driven surfaces (§8). Variants map to semantic bridged
 * tokens only (no raw hex). Sizes use the control-height tokens via bridged
 * `h-*` utilities defined in globals.css (--control-height*).
 *
 * Buttons use the shared 6px control radius. Primary is solid action;
 * secondary is the white outlined control; quiet variants preserve hierarchy
 * without introducing another component family.
 *
 * Hover moves the fill one step along the action ramp rather than fading
 * opacity, so the label keeps its verified AA contrast in every state.
 *
 * Variants only name semantic roles; surfaces never introduce local color or
 * spacing overrides.
 */
export const buttonVariants = cva(
  'focus-ring shadow-xs inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] border font-sans font-[550] no-underline transition-[transform,background-color,color,border-color,box-shadow] duration-[120ms] ease-out active:scale-[0.98] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-75',
  {
    variants: {
      variant: {
        primary:
          'border-action bg-action text-action-fg hover:bg-action-hover active:bg-action-active',
        accent:
          'border-accent bg-accent-soft text-accent-text shadow-none hover:bg-accent hover:text-accent-fg active:bg-accent-hover',
        secondary:
          'border-border bg-panel text-foreground hover:border-border-strong hover:bg-background-alt active:bg-well',
        tonal:
          'border-accent-border bg-accent-subtle text-accent-text shadow-none hover:border-accent hover:bg-accent-border active:bg-accent-border',
        neutral:
          'border-transparent bg-background-alt text-foreground shadow-none hover:bg-well active:bg-active',
        ghost:
          'border-transparent bg-transparent text-secondary shadow-none hover:bg-background-alt hover:text-foreground active:bg-well',
        destructive:
          'border-transparent bg-danger-solid text-danger-fg shadow-none hover:bg-danger-solid-hover active:bg-danger-solid-hover',
        destructiveGhost:
          'border-transparent bg-transparent text-danger-text shadow-none hover:bg-danger-bg active:bg-danger-bg',
      },
      size: {
        sm: 'h-[var(--control-height-sm)] px-2.5 text-sm',
        md: 'h-[var(--control-height)] px-3 text-sm',
        lg: 'h-[var(--control-height-lg)] px-4 text-sm',
        icon: 'size-[var(--control-height)] px-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);
