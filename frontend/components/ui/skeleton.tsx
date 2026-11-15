import {
  CardBlocks,
  FigureBlocks,
  ShapeBlocks,
  SkeletonBlock,
  SkeletonFrame,
  TableBlocks,
  TEXT_WIDTHS,
  type ChartHeight,
} from '@/components/ui/skeleton-block';
import { cn } from '@/lib/utils';

type SkeletonProps = Readonly<{
  /** What is loading, as a verb: "Loading runs". */
  label?: string;
  className?: string;
}> &
  (
    | Readonly<{ variant?: 'text'; lines?: 1 | 2 | 3 }>
    | Readonly<{ variant: 'table'; columns: number; rows?: number; head?: boolean }>
    | Readonly<{ variant: 'stat'; count?: number }>
    | Readonly<{ variant: 'form'; fields?: number }>
    | Readonly<{ variant: 'block'; rows?: number }>
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
 *   `form`  — `fields` label and field blocks.
 *   `block` — a card body: a title block over `rows` text blocks.
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
      return <TableBlocks columns={props.columns} rows={props.rows} head={props.head} />;
    case 'stat':
      return <FigureBlocks count={props.count ?? 4} />;
    case 'form':
      return <FormBlocks fields={props.fields} />;
    case 'block':
      return <CardBlocks lines={props.rows} />;
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

const range = (count: number) => Array.from({ length: count }, (_, index) => index);

function TextBlocks({ lines = 3 }: Readonly<{ lines?: 1 | 2 | 3 }>) {
  return (
    <span className="grid gap-2">
      {TEXT_WIDTHS.slice(0, lines).map((width) => (
        <SkeletonBlock key={width} className={cn('h-4', width)} />
      ))}
    </span>
  );
}

function FormBlocks({ fields = 3 }: Readonly<{ fields?: number }>) {
  return (
    <span className="grid gap-4">
      {range(fields).map((index) => (
        <span key={index} className="grid max-w-160 gap-1">
          <SkeletonBlock className="h-4 w-32" />
          <SkeletonBlock className="h-[var(--control-md)] w-full" />
        </span>
      ))}
    </span>
  );
}
