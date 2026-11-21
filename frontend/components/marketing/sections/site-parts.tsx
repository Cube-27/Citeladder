import type { ReactNode } from 'react';

import { ArrowRight } from '@/lib/icons';
import { DEMO_EXTERNAL } from '@/lib/marketing-content/nav';
import { cn } from '@/lib/utils';

/**
 * The website's arrow link: 16/24 medium ink with an arrow that nudges 2px on
 * hover. With an `href` it is a link; without one it is the visual end of a
 * card that is itself the link (FeatureCard), so it never nests
 * an anchor in an anchor.
 */
export function SiteArrowLink({
  href,
  children,
  className,
  demo = false,
}: Readonly<{
  href?: string;
  children: ReactNode;
  className?: string;
  /** Marks a link to the demo funnel, which marketing analytics counts as a demo click. */
  demo?: boolean;
}>) {
  const content = (
    <>
      <span className="cl-arrowlink-text">{children}</span>
      <ArrowRight aria-hidden className="cl-arrowlink-icon size-4" />
    </>
  );
  if (!href) return <span className={cn('cl-arrowlink', className)}>{content}</span>;
  return (
    <a
      href={href}
      className={cn('cl-arrowlink focus-ring', className)}
      data-demo-cta={demo ? '' : undefined}
      // The demo funnel may leave the site; its target and safe rel live here.
      {...(demo && DEMO_EXTERNAL ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {content}
    </a>
  );
}

/** The eyebrow over a heading: uppercase mono, one to three words. */
export function Eyebrow({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="type-eyebrow cl-eyebrow">{children}</p>;
}

/** A check list: FeatureSplit's points (body) and a plan's features (`small`). */
export function CheckList({
  items,
  small = false,
}: Readonly<{ items: readonly string[]; small?: boolean }>) {
  return (
    <ul className={cn('cl-checks', small && 'cl-checks--sm')}>
      {items.map((item) => (
        <li key={item}>
          <span aria-hidden className="cl-checks-mark" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Grid columns that follow the item count, so 2, 3 or 4 cards always fill
 * the row: up to four sit in one row; more go four or three a row.
 */
export function columnsFor(count: number): 1 | 2 | 3 | 4 {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  if (count === 4) return 4;
  return count % 4 === 0 ? 4 : 3;
}
