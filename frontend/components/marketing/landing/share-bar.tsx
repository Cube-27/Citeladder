import { cn } from '@/lib/utils';

type SegmentKey = 'yours' | 'competitors' | 'none';

type Segment = Readonly<{
  key: SegmentKey;
  name: string;
  width: number;
  label: string;
}>;

/** The neutral series walk the semantic ramp: mid rule for competitors, quiet well for no brand. */
const SEGMENT_FILL: Record<SegmentKey, string> = {
  yours: 'bg-accent',
  competitors: 'bg-border',
  none: 'bg-active',
};

const SEGMENT_LABEL: Record<SegmentKey, string> = {
  yours: 'text-accent-fg',
  competitors: 'text-foreground',
  none: 'text-secondary',
};

/** Render the complete illustration on the server without a hydration-time layout reset. */
export function ShareBar({ segments }: Readonly<{ segments: readonly Segment[] }>) {
  return (
    <>
      <div className="border-border-subtle mt-3 flex h-[34px] overflow-hidden rounded-[var(--radius-xs)] border">
        {segments.map((segment) => (
          <div
            key={segment.key}
            style={{ width: `${segment.width}%` }}
            className={cn('relative flex min-w-0 items-center', SEGMENT_FILL[segment.key])}
          >
            <span
              className={cn(
                'hidden truncate px-2.5 text-xs font-medium sm:inline',
                SEGMENT_LABEL[segment.key],
              )}
            >
              {segment.label}
            </span>
          </div>
        ))}
      </div>
      <div className="text-secondary mt-2.5 flex flex-wrap gap-x-6 gap-y-1.5 text-xs">
        {segments.map((segment) => (
          <span key={segment.key} className="flex items-center gap-2">
            <i aria-hidden className={cn('size-2.5 rounded-xs', SEGMENT_FILL[segment.key])} />
            {segment.name}
          </span>
        ))}
      </div>
    </>
  );
}
