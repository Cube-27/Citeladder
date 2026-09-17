import { cva } from 'class-variance-authority';

/**
 * Button CVA — token-driven surfaces (§8). Variants map to semantic bridged
 * tokens only (no raw hex). Sizes use the control-height tokens via bridged
 * `h-*` utilities defined in globals.css (--control-height*).
 *
 * Buttons use the shared 6px control radius. Primary is solid action;
 * secondary is the white control with the smudged edge (the fused ring +
 * drop of --shadow-smudge, never a drawn hairline); quiet variants preserve
 * hierarchy without introducing another component family.
 *
 * Hover moves the fill one step along the action ramp rather than fading
 * opacity, so the label keeps its verified AA contrast in every state. The one
 * exception is `secondary`: it is a white control on white paper, so its edge
 * IS its affordance and the fill has almost nowhere to move. That variant
 * alone deepens the smudge on hover — still a fused ring, never a drawn border.
 *
 * Variants only name semantic roles; surfaces never introduce local color or
 * spacing overrides.
 */
export const buttonVariants = cva(
  'focus-ring inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] font-sans font-[550] no-underline transition-[transform,background-color,color,box-shadow] duration-[120ms] ease-out active:scale-[0.98] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-75',
  {
    variants: {
      variant: {
        primary:
          'bg-action text-action-fg shadow-smudge hover:bg-action-hover active:bg-action-active',
        accent:
          'bg-accent-soft text-accent-text shadow-smudge hover:bg-accent hover:text-accent-fg active:bg-accent-hover',
        secondary:
          'bg-panel text-foreground shadow-smudge hover:bg-background-alt hover:shadow-smudge-hover active:bg-well',
        tonal:
          'bg-accent-subtle text-accent-text shadow-smudge hover:bg-accent-border active:bg-accent-border',
        neutral: 'bg-background-alt text-foreground shadow-none hover:bg-well active:bg-active',
        ghost:
          'bg-transparent text-secondary shadow-none hover:bg-background-alt hover:text-foreground active:bg-well',
        destructive:
          'bg-danger-solid text-danger-fg shadow-none hover:bg-danger-solid-hover active:bg-danger-solid-hover',
        destructiveGhost:
          'bg-transparent text-danger-text shadow-none hover:bg-danger-bg active:bg-danger-bg',
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
