import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { Icon } from '@/components/ui/icon';
import { SLIP_FACE } from '@/components/ui/slip';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * A wide card that opens something (a directory entry, such as a skill): the
 * caller's link carries `ICON_CARD`, and `IconCardContent` fills it with a
 * 40px `well` tile and its 20px glyph, the title and its lines, and a chevron.
 * The title is plain `ink` at rest and underlines on hover and focus-visible.
 */
export const ICON_CARD = cn(
  SLIP_FACE,
  'group focus-ring-inset hover:overlay-hover grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-start gap-4 p-4 no-underline',
);

export function IconCardContent({
  icon: Glyph,
  title,
  children,
}: Readonly<{ icon: LucideIcon; title: ReactNode; children?: ReactNode }>) {
  return (
    <>
      <span className="bg-well rounded-card text-ink-2 flex size-10 items-center justify-center">
        <Glyph aria-hidden className="size-5" />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
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
