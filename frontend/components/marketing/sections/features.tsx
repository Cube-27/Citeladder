import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { CheckList, Eyebrow, SiteArrowLink } from './site-parts';

/**
 * FeatureCard: a surface card with an optional product image on top, an
 * eyebrow, a title (title, or display-md at `lg`), body and, as a link, an
 * arrow line. With an `href` the whole card is the link.
 */
export function FeatureCard({
  href,
  linkLabel = 'Learn more',
  eyebrow,
  title,
  body,
  size = 'md',
  media,
}: Readonly<{
  href?: string;
  linkLabel?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  size?: 'md' | 'lg';
  /** The card's product image (a ProductFrame well), above the copy. */
  media?: ReactNode;
}>) {
  const className = cn('cl-fcard', size === 'lg' && 'cl-fcard--lg', href && 'focus-ring');
  const content = (
    <>
      {media}
      <div className="cl-fcard-body">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h3 className="cl-fcard-title">{title}</h3>
        {body && <p className="cl-fcard-text">{body}</p>}
        {href && <SiteArrowLink className="cl-fcard-more">{linkLabel}</SiteArrowLink>}
      </div>
    </>
  );
  return href ? (
    <a href={href} className={className}>
      {content}
    </a>
  ) : (
    <article className={className}>{content}</article>
  );
}

/** A Bento column span: the authored widths the system's grids use. */
export type BentoSpan = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;

/** Under 900px a span keeps its band: small to a third, medium to a half, large to full. */
function spanBand(span: BentoSpan): 'small' | 'medium' | 'large' {
  if (span <= 3) return 'small';
  return span <= 8 ? 'medium' : 'large';
}

/**
 * Bento: a 12-column grid of cards. Each cell's span holds to 900px, falls to
 * its band (third, half or full) to 768px, and stacks below.
 */
export function Bento({
  cells,
}: Readonly<{ cells: readonly Readonly<{ key: string; span: BentoSpan; content: ReactNode }>[] }>) {
  return (
    <div className="cl-bento">
      {cells.map((cell) => (
        <div
          key={cell.key}
          className={cn('cl-bento-cell', `cl-span-${cell.span}`)}
          data-span-band={spanBand(cell.span)}
        >
          {cell.content}
        </div>
      ))}
    </div>
  );
}

/**
 * FeatureSplit: copy on 5/12 beside a product image on 7/12, reversible;
 * stacked under 1024px with the copy first. Consecutive splits sit 128 apart.
 */
export function FeatureSplit({
  eyebrow,
  title,
  body,
  points,
  link,
  reverse = false,
  as: Heading = 'h3',
  media,
}: Readonly<{
  eyebrow?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  points?: readonly ReactNode[];
  link?: Readonly<{ href: string; label: ReactNode }>;
  reverse?: boolean;
  as?: 'h2' | 'h3';
  media: ReactNode;
}>) {
  return (
    <div className={cn('cl-split', reverse && 'cl-split--reverse')}>
      <div className="cl-split-copy">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <Heading className="cl-split-title">{title}</Heading>
        {body && <p className="cl-split-text">{body}</p>}
        {points && points.length > 0 && <CheckList items={points} />}
        {link && <SiteArrowLink href={link.href}>{link.label}</SiteArrowLink>}
      </div>
      <div className="cl-split-media">{media}</div>
    </div>
  );
}
