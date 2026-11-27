import { SkeletonFrame, TableBlocks } from '@/components/ui/skeleton-block';
import { Section, SectionBleed, SectionHeader } from '@/components/ui/section';

const CONTROL = <span className="h-control-md block" />;

export function ToolbarTableLoading({
  label,
  columns,
  rows,
  view = false,
}: Readonly<{ label: string; columns: number; rows?: number; view?: boolean }>) {
  return (
    <SkeletonFrame label={label} variant="table" className="grid min-w-0">
      <Section>
        <SectionHeader search={CONTROL} actions={view ? CONTROL : undefined} />
        <SectionBleed data-loading-shape="table">
          <TableBlocks columns={columns} rows={rows} />
        </SectionBleed>
      </Section>
    </SkeletonFrame>
  );
}
