import { FilterBar } from '@/components/ui/filter-bar';
import { SkeletonFrame, TableBlocks } from '@/components/ui/skeleton-block';
import { FRAME_FACE } from '@/components/ui/slip';
import { cn } from '@/lib/utils';

/**
 * A DataTable with a toolbar before its first read: the header bar's held
 * toolbar (DataTable's inset and 12 under it; a view's row over the search row
 * when it has a `view`), then the table's blocks in its frame. Light, so a
 * route's loading frame can draw it without loading the table.
 */
export function ToolbarTableLoading({
  label,
  columns,
  rows,
  view = false,
}: Readonly<{ label: string; columns: number; rows?: number; view?: boolean }>) {
  return (
    <SkeletonFrame label={label} variant="table" className="grid min-w-0">
      <header className="grid min-w-0 px-[var(--table-bar-inset,16px)] pb-3">
        <FilterBar
          view={view ? <span className="block h-[var(--control-md)]" /> : undefined}
          search={<span />}
        />
      </header>
      <div
        data-loading-shape="table"
        className={cn(FRAME_FACE, 'skeleton-sweep grid min-w-0 overflow-hidden')}
      >
        <TableBlocks columns={columns} rows={rows} />
      </div>
    </SkeletonFrame>
  );
}
