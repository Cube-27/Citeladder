import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Eyebrow } from './site-parts';

export type HighlightStat = Readonly<{ label: string; value: string; sub?: ReactNode }>;

/** Stat columns: a set of stats holds one row (six included), never 4 + 2. */
function statColumns(count: number): 1 | 2 | 3 | 4 | 6 {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  if (count === 6) return 6;
  return 4;
}

/**
 * PageHighlight: the page's one inverted tile. Its ground is the page's ink
 * and its ink the page's surface, remapped in CSS (site.css), so it inverts
 * in both themes without script. Stats never orphan: three hold one row
 * while the tile is 480px wide and then stack; four go 4, 2 × 2, then 1.
 */
export function PageHighlight({
  eyebrow,
  title,
  body,
  stats = [],
  steps = [],
  action,
  as: Heading = 'h3',
  children,
}: Readonly<{
  eyebrow?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  stats?: readonly HighlightStat[];
  /** A short ordered how-to (for a tile with no numbers), each title over its line. */
  steps?: readonly Readonly<{ title: string; body: ReactNode }>[];
  action?: ReactNode;
  as?: 'h2' | 'h3';
  children?: ReactNode;
}>) {
  // A tile with only its copy is a statement band: the copy centres so no side sits empty (D21).
  const statement = stats.length === 0 && steps.length === 0 && !children && !action;
  return (
    <div className={cn('cl-page-hl', statement && 'cl-page-hl--statement')}>
      <div className="cl-page-hl-inner">
        <div className="cl-page-hl-copy">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <Heading className="cl-page-hl-title">{title}</Heading>
          {body && <p className="cl-page-hl-text">{body}</p>}
        </div>
        {stats.length > 0 && (
          <dl className={cn('cl-page-hl-stats', `cl-page-hl-stats--${statColumns(stats.length)}`)}>
            {stats.map((stat) => (
              <div key={stat.label} className="cl-page-hl-stat">
                <dt className="type-eyebrow">{stat.label}</dt>
                <dd className="cl-page-hl-value">{stat.value}</dd>
                {stat.sub && <dd className="cl-page-hl-sub">{stat.sub}</dd>}
              </div>
            ))}
          </dl>
        )}
        {steps.length > 0 && (
          <ol className="cl-page-hl-steps">
            {steps.map((step) => (
              <li key={step.title}>
                <p className="cl-page-hl-step">{step.title}</p>
                <p className="cl-page-hl-text">{step.body}</p>
              </li>
            ))}
          </ol>
        )}
        {children}
        {action && <div className="cl-page-hl-action">{action}</div>}
      </div>
    </div>
  );
}
