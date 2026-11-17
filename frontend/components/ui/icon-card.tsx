import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Icon } from '@/components/ui/icon';
import { slipClasses } from '@/components/ui/slip';
import { textRole } from '@/components/ui/typography';

/**
 * A wide slip that opens something (a directory entry, such as a skill): the
 * caller's link carries `ICON_CARD`, and `IconCardContent` fills it with the
 * 40px icon tile and its 20px glyph, the title and its lines, and a chevron.
 * The link's underline is clear at rest and inks on hover and focus-visible.
 */
export const ICON_CARD = slipClasses(
  'border-control-edge border focus-ring-inset hover:overlay-hover flex w-full items-start gap-4 underline underline-offset-3 decoration-transparent hover:decoration-current focus-visible:decoration-current',
);

export function IconCardContent({
  icon: Glyph,
  title,
  detailId,
  children,
}: Readonly<{
  icon: LucideIcon;
  title: ReactNode;
  /** Names the lines under the title, for the link's `aria-describedby`. */
  detailId: string;
  children: ReactNode;
}>) {
  return (
    <>
      <span aria-hidden data-icon-tile="" className="shrink-0">
        <Glyph className="text-ink-2 size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className={textRole('label', 'text-ink')}>{title}</h3>
        {/* An inline-flex box is atomic, so the link's underline stops at the title. */}
        <div id={detailId} className="mt-1 inline-flex w-full flex-col gap-1 align-top">
          {children}
        </div>
      </div>
      <Icon icon={ChevronRight} className="text-ink-2" />
    </>
  );
}
