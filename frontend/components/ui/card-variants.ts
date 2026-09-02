import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Card is a semantic object, not a structural layout container.
 *
 * It owns a hairline border. Twenty-nine places used to hand-roll
 * `bg-panel border rounded-* p-*` because the primitive had no border of its
 * own — so the app's "bordered card" was, by definition, always off-system.
 * Giving the owner the border is what removes the reason to rebuild it.
 *
 * Elevation stays overlay-only: a card is defined by its edge, never a shadow.
 *
 * The card deliberately sets no display of its own. Making it a flex column
 * would be convenient for pinning a `CardFooter`, but it would also re-flow
 * every card in the app and put an `overflow` boundary between a sticky child
 * and its scroll container. `CardGrid` opts a row into that column layout
 * instead, so only the cards that need aligned footers get it.
 */
const cardVariants = cva('bg-panel border-border-subtle rounded-[var(--radius-card)] border');

export type CardTone = 'default' | 'danger';

export const cardClasses = (tone: CardTone = 'default') =>
  cn(cardVariants({}), tone === 'danger' && 'border-danger-border');
