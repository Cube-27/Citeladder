import { cva } from 'class-variance-authority';

/**
 * Button CVA — token-driven surfaces (§8). Variants map to semantic bridged
 * tokens only (no raw hex). Sizes use the control-height tokens via bridged
 * `h-*` utilities defined in globals.css (--control-height*).
 *
 * Flat/hairline language: every variant is a pill, but nothing lifts or
 * glows. Primary is the monochrome pill — `bg-foreground` (bridged
 * --text-primary) with `text-background`; blue stays reserved for
 * links/active/focus. Secondary is a panel surface behind a hairline border;
 * ghost is transparent and tints to background-alt (no accent fill).
 */
export const buttonVariants = cva(
  'focus-ring inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border font-sans font-medium leading-none no-underline transition-[background-color,color,border-color] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'border-transparent bg-foreground text-background hover:bg-foreground/90',
        secondary:
          'border-border bg-panel text-foreground hover:bg-background-alt hover:border-border-strong',
        neutral: 'border-border bg-background-alt text-foreground hover:bg-well',
        ghost:
          'border-transparent bg-transparent text-secondary hover:bg-background-alt hover:text-foreground',
        destructive: 'border-transparent bg-danger text-accent-fg hover:opacity-90',
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
