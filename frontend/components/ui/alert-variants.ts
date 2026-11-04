import { cva } from 'class-variance-authority';

/** Compact inline feedback. Tone is carried by icon and text, never a box. */
export const alertVariants = cva('type-body flex items-start gap-2', {
  variants: {
    tone: {
      danger: 'text-negative',
      warning: 'text-warning',
      success: 'text-positive',
      info: 'text-info',
      neutral: 'text-ink-secondary',
    },
  },
  defaultVariants: {
    tone: 'danger',
  },
});
