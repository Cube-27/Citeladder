import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Icon } from '@/components/ui/icon';
import { slipClasses } from '@/components/ui/slip';
import { textRole } from '@/components/ui/typography';

/**
 * A wide slip that opens something (a directory entry, such as a skill): the
 * caller's link carries `ICON_CARD`, and `IconCardContent` fills it with the
 * 40px icon tile and its 20px glyph, the title and its lines, and a chevron.
 * The title is plain `ink` at rest and underlines on hover and focus-visible.
 */
export const ICON_CARD = slipClasses(
  'focus-ring-inset hover:overlay-hover flex w-full items-start gap-4 no-underline decoration-transparent hover:decoration-current focus-visible:decoration-current',
);

export function IconCardContent({
  icon: Glyph,
  title,
  children,
}: Readonly<{ icon: LucideIcon; title: ReactNode; children?: ReactNode }>) {
  return (
    <>
      <span aria-hidden data-icon-tile="" className="shrink-0">
        <Glyph className="text-ink-2 size-5" />
      </span>
      {/* The title's underline takes the card's decoration colour: clear at rest, ink on hover and focus. */}
      <span className="flex min-w-0 flex-1 flex-col gap-1 decoration-inherit">
        <h3
          className={textRole('label', 'text-ink underline-offset-3 underline decoration-inherit')}
        >
          {title}
        </h3>
        {children}
      </span>
      <Icon icon={ChevronRight} className="text-ink-2" />
    </>
  );
}
