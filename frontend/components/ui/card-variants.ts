import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Card is a semantic object, not a structural layout container.
 *
 * Cards are bounded semantic objects, separated by their edge and the tone
 * beneath them. `shadow-card` is a contact shadow, not elevation: a hair that
 * keeps a bordered white box from looking printed onto the pane. Real lift —
 * something that reads as ABOVE the page — stays with overlays and dropdowns.
 *
 * The card deliberately sets no display of its own. Making it a flex column
 * would be convenient for pinning a `CardFooter`, but it would also re-flow
 * every card in the app and put an `overflow` boundary between a sticky child
 * and its scroll container. `CardGrid` opts a row into that column layout
 * instead, so only the cards that need aligned footers get it.
 */
const cardVariants = cva('bg-panel border border-border shadow-card rounded-[var(--radius-card)]');

export type CardTone = 'default' | 'danger' | 'recommendation';

export const cardClasses = (tone: CardTone = 'default') =>
  cn(
    cardVariants({}),
    tone === 'danger' && 'border-danger-border',
    tone === 'recommendation' && 'bg-recommendation border-accent-border',
  );
