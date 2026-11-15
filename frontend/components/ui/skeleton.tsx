import { useEffect, useState } from 'react';

import { Spinner } from '@/components/ui/spinner';
import { textRole } from '@/components/ui/typography';
import { LOADING_INDICATOR_DELAY_MS } from '@/lib/config/operational';
import { cn } from '@/lib/utils';

type SkeletonProps = Readonly<{
  /** What is loading, as a verb: "Loading runs". */
  label?: string;
  className?: string;
}> &
  (
    | Readonly<{ variant?: 'text'; lines?: number; rows?: never }>
    | Readonly<{ variant: 'row'; rows?: number; lines?: never }>
    | Readonly<{ variant: 'block' | 'chart'; lines?: never; rows?: never }>
  );

/** Rows a 160px block holds at the 36px row. */
const BLOCK_ROWS = 4;
/** A chart's blank: its four gridlines. */
const CHART_GRIDLINES = 4;

/**
 * Skeleton — the ruled blank (2.7): the rules and line boxes of the final
 * layout with blank values, and one live rung with its verb, so nothing moves
 * by more than 8px when the content arrives. No grey bars and no shimmer.
 *
 *   `text`  — `lines` blank 20px line boxes.
 *   `row`   — `rows` blank table rows on inset hairlines.
 *   `block` — a 160px slip body of blank rows.
 *   `chart` — the chart's height with its gridlines.
 *
 * Match the count of what will load: a 25-row table loads 25 rows.
 */
export function Skeleton(props: SkeletonProps) {
  const { label = 'Loading', className } = props;
  // The blank is drawing, not content: only the live verb is announced, and
  // only once it shows (after the delay).
  return (
    <div aria-busy="true" className={cn('flex min-w-0 flex-col', className)}>
      <SkeletonBody {...props} label={label} />
    </div>
  );
}

const RULED_ROW = 'flex h-[var(--table-row-height)] items-center px-[var(--table-cell-padding-x)]';

function SkeletonBody(props: SkeletonProps & Readonly<{ label: string }>) {
  switch (props.variant) {
    case 'row':
      return <BlankRows count={props.rows ?? 3} label={props.label} />;
    case 'block':
      return (
        <span className="block h-40 overflow-hidden">
          <BlankRows count={BLOCK_ROWS} label={props.label} />
        </span>
      );
    case 'chart':
      return (
        <span className="flex h-[var(--chart-height-md)] flex-col justify-between">
          {Array.from({ length: CHART_GRIDLINES }, (_, index) => (
            <span
              key={index}
              aria-hidden={index === 0 ? undefined : true}
              className="border-rule flex min-h-5 items-start border-t pt-1"
            >
              {index === 0 ? <LiveVerb label={props.label} /> : null}
            </span>
          ))}
        </span>
      );
    default:
      return Array.from({ length: props.lines ?? 3 }, (_, index) => (
        <span
          key={index}
          aria-hidden={index === 0 ? undefined : true}
          className="flex h-5 items-center"
        >
          {index === 0 ? <LiveVerb label={props.label} /> : null}
        </span>
      ));
  }
}

function BlankRows({ count, label }: Readonly<{ count: number; label: string }>) {
  return Array.from({ length: count }, (_, index) => (
    <span
      key={index}
      data-ruled-row=""
      aria-hidden={index === 0 ? undefined : true}
      className={RULED_ROW}
    >
      {index === 0 ? <LiveVerb label={label} /> : null}
    </span>
  ));
}

/**
 * Loaders on screen that have already been revealed. A cold load passes
 * through several owners in turn (shell, route chunk, first read); a loader
 * that mounts while another is showing is the same wait, so it starts revealed.
 */
let revealedLoaders = 0;

/**
 * The live rung and its verb ("Loading runs"), held back a beat
 * (`loading-delayed`): a read that answers at once shows only its rules.
 */
export function LiveVerb({ label }: Readonly<{ label: string }>) {
  const [continued] = useState(() => revealedLoaders > 0);
  const [revealed, setRevealed] = useState(continued);
  useEffect(() => {
    if (!revealed) {
      const timer = setTimeout(() => setRevealed(true), LOADING_INDICATOR_DELAY_MS);
      return () => clearTimeout(timer);
    }
    revealedLoaders += 1;
    return () => {
      revealedLoaders -= 1;
    };
  }, [revealed]);
  return (
    <span className={cn('flex min-h-5 items-center', continued ? undefined : 'loading-delayed')}>
      {revealed ? (
        <output aria-label={label} className="inline-flex items-center gap-2">
          <Spinner />
          <span aria-hidden className={textRole('body', 'text-ink-2')}>
            {label}
          </span>
        </output>
      ) : null}
    </span>
  );
}
