import { TableToolbar } from '@/components/ui/filter-bar';
import { SkeletonFrame, TableBlocks } from '@/components/ui/skeleton-block';
import { Section, SectionBleed, SectionToolbar } from '@/components/ui/section';

export function ToolbarTableLoading({
  label,
  columns,
  rows,
  view = false,
}: Readonly<{ label: string; columns: number; rows?: number; view?: boolean }>) {
  return (
    <SkeletonFrame label={label} variant="table" className="grid min-w-0">
      <Section>
        <SectionToolbar>
          <TableToolbar
            view={view ? <span className="h-control-md block" /> : undefined}
            search={<span />}
          />
        </SectionToolbar>
        <SectionBleed data-loading-shape="table">
          <TableBlocks columns={columns} rows={rows} />
        </SectionBleed>
      </Section>
    </SkeletonFrame>
  );
}
