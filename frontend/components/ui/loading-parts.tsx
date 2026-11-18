import { SectionHeader } from '@/components/ui/section';
import { SkeletonBlock, SkeletonFrame } from '@/components/ui/skeleton-block';
import { textRole, type TextRole } from '@/components/ui/typography';

const LINE_WIDTH = {
  short: 'w-32',
  medium: 'w-48',
  long: 'w-64',
  part: 'w-2/5',
  most: 'w-3/5',
} as const;

/** One line of `text` while it loads: that text role's line height, a block inside. */
export function TextLineSkeleton({
  text,
  width,
}: Readonly<{ text: TextRole; width: keyof typeof LINE_WIDTH }>) {
  return (
    <span aria-hidden className={textRole(text, 'flex h-lh items-center')}>
      <SkeletonBlock className={LINE_WIDTH[width]} />
    </span>
  );
}

/**
 * A section's header while its read is pending: the title line in its role,
 * the description line, and the severity ring a count summary carries beside them.
 */
export function SectionHeaderSkeleton({
  title,
  ring = false,
}: Readonly<{ title: 'figure' | 'heading'; ring?: boolean }>) {
  return (
    <SectionHeader actions={ring ? <SkeletonBlock className="size-24 rounded-full" /> : undefined}>
      <TextLineSkeleton text={title} width={title === 'figure' ? 'medium' : 'short'} />
      <TextLineSkeleton text="body" width="long" />
    </SectionHeader>
  );
}

/**
 * A line chart over time as it loads: its key, the plot, the event key and
 * the caption under it, at the loaded chart's height.
 */
export function LineChartSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <SkeletonFrame label={label} variant="chart">
      <div className="grid gap-[var(--compact-gap)]">
        <div className="flex min-w-0 flex-col gap-4">
          <TextLineSkeleton text="caption" width="medium" />
          <SkeletonBlock className="h-[var(--chart-height-md)] w-full" />
          <TextLineSkeleton text="caption" width="most" />
        </div>
        <TextLineSkeleton text="caption" width="part" />
      </div>
    </SkeletonFrame>
  );
}
