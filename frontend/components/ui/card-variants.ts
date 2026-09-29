import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Card is a semantic object, not a structural layout container.
 *
 * Cards separate from the ground by fill contrast alone: the elevated panel
 * fill against the shell ground is the boundary, so a card carries no border
 * and no resting shadow. Real lift — something that reads as ABOVE the page —
 * stays with overlays and dropdowns. The tinted tones keep a hairline because
 * there the edge carries status, not separation.
 *
 * The card deliberately sets no display of its own. Making it a flex column
 * would be convenient for pinning a `CardFooter`, but it would also re-flow
 * every card in the app and put an `overflow` boundary between a sticky child
 * and its scroll container. `CardGrid` opts a row into that column layout
 * instead, so only the cards that need aligned footers get it.
 */
const cardVariants = cva('bg-panel rounded-[var(--radius-card)]');

export type CardTone = 'default' | 'danger' | 'recommendation';

export const cardClasses = (tone: CardTone = 'default') =>
  cn(
    cardVariants({}),
    tone === 'danger' && 'border border-danger-border',
    tone === 'recommendation' && 'bg-accent-soft border border-accent-border',
  );
