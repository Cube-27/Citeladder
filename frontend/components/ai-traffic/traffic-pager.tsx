import type { ComponentProps } from 'react';

import { CursorPager } from '@/components/ui/cursor-pager';

/** Previous/next for a cursor table, drawn only when there is another page to reach. */
export function TrafficPager(props: Readonly<ComponentProps<typeof CursorPager>>) {
  if (!props.canPrev && !props.canNext) return null;
  return (
    <div className="flex items-center justify-end gap-2">
      <CursorPager {...props} />
    </div>
  );
}
