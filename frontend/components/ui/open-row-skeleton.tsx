import { ChevronRight } from 'lucide-react';

import { Icon } from '@/components/ui/icon';
import { SkeletonBlock } from '@/components/ui/skeleton-block';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * A pressable row's own geometry: 12 across and 8 down, its parts 12 apart,
 * at least one control tall (44 below 900px or under a coarse pointer). It
 * bleeds 12 past its list on both sides, so its text starts on the card's
 * own padding and only the hover fill reaches past it.
 */
export const pressableRowClasses =
  'focus-ring -mx-3 flex min-h-[var(--control-md)] w-[calc(100%+24px)] min-w-0 items-center gap-3 px-3 py-2 text-start';

/**
 * An `OpenRow` with a caption while its read is pending: the row's geometry,
 * a title block (16) over a caption block (12). Apart from the rows, so a
 * route's loading frame draws it without loading them.
 */
export function OpenRowSkeleton() {
  return (
    <span aria-hidden className={cn(pressableRowClasses, 'pointer-events-none')}>
      <span className="grid min-w-0 flex-1 gap-1">
        <span className={textRole('body', 'flex h-lh items-center')}>
          <SkeletonBlock className="h-4 w-2/5" />
        </span>
        <span className="type-caption flex h-lh items-center">
          <SkeletonBlock className="w-1/3" />
        </span>
      </span>
      <Icon icon={ChevronRight} className="text-ink-2 shrink-0 opacity-0" />
    </span>
  );
}
