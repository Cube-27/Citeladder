import { cva } from 'class-variance-authority';

/**
 * Card — flat by default (Tesla elevation is essentially none). A white
 * `bg-panel` fill on the Light Ash canvas separates by tone, and a faint
 * `border-subtle` hairline keeps the edge legible on white marketing bands too,
 * so the card never depends on a shadow. Interactive cards opt into
 * `hover:shadow-card-hover` (the one sanctioned whisper) plus a border shift at
 * the shared surface transition — which is why the transition is retained.
 */
export const cardVariants = cva(
  'bg-panel border-border-subtle rounded-lg border transition-[box-shadow,border-color] duration-[330ms] ease-standard',
);

export const cardClasses = () => cardVariants({});
