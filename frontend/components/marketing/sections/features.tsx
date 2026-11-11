import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { CheckList, Eyebrow, SiteArrowLink } from './site-parts';
import './features.css';

/**
 * A linked card names where it goes ("Explore AI Visibility"), never a bare
 * "Learn more" (D36), so a link always brings its label.
 */
type FeatureCardLink =
  | Readonly<{ href: string; linkLabel: string }>
  | Readonly<{ href?: undefined; linkLabel?: undefined }>;

/**
 * FeatureCard (D44: no border, shadow or lift): a soft tint panel when it
 * links or holds a product image, otherwise a column under a hairline rule;
 * an optional product image on top, then an optional eyebrow (only where it
 * adds what the title lacks, such as a unit), a title (title, or display-md
 * at `lg`), body, an optional check list and, as a link, an arrow line
 * naming the destination. With an `href` the whole card is the link. A
 * `wide` card (alone in its row) sets its points beside the copy, not under it.
 */
export function FeatureCard({
  href,
  linkLabel,
  eyebrow,
  title,
  body,
  points,
  size = 'md',
  wide = false,
  as: Heading = 'h3',
  media,
}: FeatureCardLink &
  Readonly<{
    eyebrow?: ReactNode;
    title: ReactNode;
    body?: ReactNode;
    /** What the card covers, as a small check list under the body. */
    points?: readonly string[];
    size?: 'md' | 'lg';
    /** The card fills a full row: the points sit in a column beside the copy (D21). */
    wide?: boolean;
    /** `h2` when the card heads its own part of the page (no section title above it). */
    as?: 'h2' | 'h3';
    /** The card's product image (a ProductFrame; its well sits straight in the card), above the copy. */
    media?: ReactNode;
  }>) {
  const className = cn(
    'cl-fcard',
    size === 'lg' && 'cl-fcard--lg',
    wide && 'cl-fcard--wide',
    href && 'focus-ring',
  );
  const content = (
    <>
      {media}
      <div className="cl-fcard-body">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <Heading className="cl-fcard-title">{title}</Heading>
        {body && <p className="cl-fcard-text">{body}</p>}
        {points && points.length > 0 && <CheckList items={points} small />}
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
 * FeatureSplit: copy (no eyebrow, D36) on 5/12 beside a product image on 7/12, reversible;
 * stacked under 1024px with the copy first. Consecutive splits sit 128 apart.
 */
export function FeatureSplit({
  title,
  body,
  points,
  links = [],
  reverse = false,
  as: Heading = 'h3',
  media,
}: Readonly<{
  title: ReactNode;
  /** One paragraph, or several in reading order. */
  body?: string | readonly string[];
  points?: readonly string[];
  /** Arrow links under the copy, one per page the split leads to; `demo` marks the demo funnel. */
  links?: readonly Readonly<{ href: string; label: ReactNode; demo?: boolean }>[];
  reverse?: boolean;
  as?: 'h2' | 'h3';
  media: ReactNode;
}>) {
  return (
    <div className={cn('cl-split', reverse && 'cl-split--reverse')}>
      <div className="cl-split-copy">
        <Heading className="cl-split-title">{title}</Heading>
        {(typeof body === 'string' ? [body] : (body ?? [])).map((paragraph) => (
          <p key={paragraph} className="cl-split-text">
            {paragraph}
          </p>
        ))}
        {points && points.length > 0 && <CheckList items={points} />}
        {links.length > 0 && (
          <div className="cl-split-links">
            {links.map((link) => (
              <SiteArrowLink key={link.href} href={link.href} demo={link.demo}>
                {link.label}
              </SiteArrowLink>
            ))}
          </div>
        )}
      </div>
      <div className="cl-split-media">{media}</div>
    </div>
  );
}
