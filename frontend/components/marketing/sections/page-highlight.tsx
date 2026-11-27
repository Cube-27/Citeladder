import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import './page-highlight.css';

export type HighlightStat = Readonly<{ label: string; value: string; sub?: ReactNode }>;

const STAT_COLUMNS = {
  1: 'cl-page-hl-stats--1',
  2: 'cl-page-hl-stats--2',
  3: 'cl-page-hl-stats--3',
  4: 'cl-page-hl-stats--4',
  6: 'cl-page-hl-stats--6',
} as const;

function statColumns(count: number): keyof typeof STAT_COLUMNS {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  if (count === 6) return 6;
  return 4;
}

export function PageHighlight({
  title,
  body,
  stats = [],
  steps = [],
  action,
  as: Heading = 'h3',
  children,
}: Readonly<{
  title: ReactNode;
  body?: ReactNode;
  stats?: readonly HighlightStat[];
  steps?: readonly Readonly<{ title: string; body: ReactNode }>[];
  action?: ReactNode;
  as?: 'h2' | 'h3';
  children?: ReactNode;
}>) {
  return (
    <div className="cl-page-hl">
      <div className="cl-page-hl-inner">
        <div className="cl-page-hl-copy">
          <Heading className="cl-page-hl-title">{title}</Heading>
          {body && <p className="cl-page-hl-text">{body}</p>}
        </div>
        {stats.length > 0 && (
          <dl className={cn('cl-page-hl-stats', STAT_COLUMNS[statColumns(stats.length)])}>
            {stats.map((stat) => (
              <div key={stat.label} className="cl-page-hl-stat">
                <dt className="cl-kicker">{stat.label}</dt>
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
