import {
  FigureBlocks,
  ShapeBlocks,
  SkeletonBlock,
  SkeletonFrame,
  TableBlocks,
  TEXT_WIDTHS,
} from '@/components/ui/skeleton-block';
import type { ChartHeight } from '@/components/ui/chart';
import { cn } from '@/lib/utils';

type SkeletonProps = Readonly<{
  /** What is loading, as a verb: "Loading runs". */
  label?: string;
  className?: string;
}> &
  (
    | Readonly<{ variant?: 'text'; lines?: 1 | 2 | 3 }>
    | Readonly<{ variant: 'table'; columns: number; rows?: number }>
    | Readonly<{ variant: 'stat'; count?: number }>
    | Readonly<{ variant: 'facts'; rows?: number }>
    | Readonly<{ variant: 'list'; rows?: number }>
    | Readonly<{ variant: 'chart'; height?: ChartHeight }>
  );

/**
 * Skeleton — the shape of what is loading, made of `well` blocks (radius 4)
 * on the real card: never lines. Each variant is shaped like what it stands
 * for, at its final size, so content arriving moves nothing by more than 8px.
 * A soft shimmer crosses the blocks; under reduced motion they are still.
 *
 *   `text`  — two or three blocks of unequal width.
 *   `table` — the real column count: a head row and `rows` rows (40).
 *   `stat`  — `count` metric cards: a label block over a value block.
 *   `facts` — `rows` rows (40) of a label block beside a value block.
 *   `list`  — `rows` rows (48) of a tile, a title block and a caption block.
 *   `chart` — one block at the chart's height.
 *
 * The blocks are drawing, not content: only the verb is announced, after a beat.
 */
export function Skeleton(props: SkeletonProps) {
  return (
    <SkeletonFrame
      label={props.label ?? 'Loading'}
      variant={props.variant ?? 'text'}
      className={props.className}
    >
      <SkeletonBody {...props} />
    </SkeletonFrame>
  );
}

function SkeletonBody(props: SkeletonProps) {
  switch (props.variant) {
    case 'table':
      return <TableBlocks columns={props.columns} rows={props.rows} />;
    case 'stat':
      return <FigureBlocks count={props.count ?? 4} />;
    case 'facts':
      return <ShapeBlocks shape={{ kind: 'facts', rows: props.rows }} />;
    case 'list':
      return <ShapeBlocks shape={{ kind: 'list', rows: props.rows }} />;
    case 'chart':
      return <ShapeBlocks shape={{ kind: 'chart', height: props.height }} />;
    case 'text':
    case undefined:
      return <TextBlocks lines={props.lines} />;
    default: {
      const exhaustive: never = props;
      return exhaustive;
    }
  }
}

function TextBlocks({ lines = 3 }: Readonly<{ lines?: 1 | 2 | 3 }>) {
  return (
    <span className="grid gap-2">
      {TEXT_WIDTHS.slice(0, lines).map((width) => (
        <SkeletonBlock key={width} className={cn('h-4', width)} />
      ))}
    </span>
  );
}
