import { cva } from 'class-variance-authority';

/**
 * Button CVA — token-driven surfaces (§8). Variants map to semantic bridged
 * tokens only (no raw hex). Sizes use the control-height tokens via bridged
 * `h-*` utilities defined in globals.css (--control-height*).
 *
 * v2 language: buttons are `rounded-md` (8px), not pills — the pill shape is
 * retired app-wide and now belongs to badges and the segmented control only.
 * Primary is an accent fill (`bg-accent` + `text-accent-fg`), replacing the
 * flat phase's monochrome `bg-foreground` pill; the accent is no longer
 * reserved away from actions, since the primary action is exactly the thing a
 * dashboard should point at. Secondary/neutral/ghost stay quiet so a screen
 * has one obvious action.
 *
 * Hover moves the fill one step along the accent ramp rather than fading
 * opacity, so the label keeps its verified AA contrast in every state.
 */
export const buttonVariants = cva(
  'focus-ring inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-sans font-medium leading-none no-underline transition-[background-color,color,border-color] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'border-transparent bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active',
        secondary:
          'border-border bg-panel text-foreground hover:bg-background-alt hover:border-border-strong',
        neutral: 'border-border bg-background-alt text-foreground hover:bg-well',
        ghost:
          'border-transparent bg-transparent text-secondary hover:bg-background-alt hover:text-foreground',
        // Destructive paints white on its OWN fill token, not on `--danger`:
        // white fails AA against the Figma red-500 / dusk coral, so
        // `--danger-solid` is that ramp one step deeper (globals.test.ts gates
        // the `danger-fg` ↔ `danger-solid` pair). Hover walks the ramp like
        // primary does instead of fading opacity, which used to wash the label
        // out along with the fill.
        destructive:
          'border-transparent bg-danger-solid text-danger-fg hover:bg-danger-solid-hover',
      },
      size: {
        sm: 'h-[var(--control-height-sm)] px-2.5 text-xs',
        md: 'h-[var(--control-height)] px-3 text-sm',
        lg: 'h-[var(--control-height-lg)] px-4 text-base',
        icon: 'size-[var(--control-height)] px-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);
