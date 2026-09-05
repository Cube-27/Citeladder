import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Card is a semantic object, not a structural layout container.
 *
 * Cards use subtle directional bottom-weighted elevation (shadow-card)
 * instead of harsh wireframe hairline borders, creating clean visual depth.
 * Overlays and dropdowns retain stronger omnidirectional shadows.
 *
 * The card deliberately sets no display of its own. Making it a flex column
 * would be convenient for pinning a `CardFooter`, but it would also re-flow
 * every card in the app and put an `overflow` boundary between a sticky child
 * and its scroll container. `CardGrid` opts a row into that column layout
 * instead, so only the cards that need aligned footers get it.
 */
const cardVariants = cva('bg-panel rounded-[var(--radius-card)] shadow-card');

export type CardTone = 'default' | 'danger';

export const cardClasses = (tone: CardTone = 'default') =>
  cn(cardVariants({}), tone === 'danger' && 'border border-danger-border');
