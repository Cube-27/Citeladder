import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Eyebrow } from './site-parts';

export type HighlightStat = Readonly<{ label: string; value: string; sub?: ReactNode }>;

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
  action,
  as: Heading = 'h3',
  children,
}: Readonly<{
  eyebrow?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  stats?: readonly HighlightStat[];
  action?: ReactNode;
  as?: 'h2' | 'h3';
  children?: ReactNode;
}>) {
  return (
    <div className="cl-page-hl">
      <div className="cl-page-hl-inner">
        <div className="cl-page-hl-copy">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <Heading className="cl-page-hl-title">{title}</Heading>
          {body && <p className="cl-page-hl-text">{body}</p>}
        </div>
        {stats.length > 0 && (
          <dl className={cn('cl-page-hl-stats', `cl-page-hl-stats--${Math.min(stats.length, 4)}`)}>
            {stats.map((stat) => (
              <div key={stat.label} className="cl-page-hl-stat">
                <dt className="type-eyebrow">{stat.label}</dt>
                <dd className="cl-page-hl-value">{stat.value}</dd>
                {stat.sub && <dd className="cl-page-hl-sub">{stat.sub}</dd>}
              </div>
            ))}
          </dl>
        )}
        {children}
        {action && <div className="cl-page-hl-action">{action}</div>}
      </div>
    </div>
  );
}
