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
  'group focus-ring-inset hover:overlay-hover flex w-full items-start gap-4 no-underline',
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
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <h3
          className={textRole(
            'label',
            'text-ink underline-offset-3 group-hover:underline group-focus-visible:underline',
          )}
        >
          {title}
        </h3>
        {children}
      </span>
      <Icon icon={ChevronRight} className="text-ink-2" />
    </>
  );
}
