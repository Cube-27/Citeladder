import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { CheckList, Eyebrow, SiteArrowLink } from './site-parts';
import './features.css';

type FeatureCardLink =
  | Readonly<{ href: string; linkLabel: string }>
  | Readonly<{ href?: undefined; linkLabel?: undefined }>;

export function FeatureCard({
  href,
  linkLabel,
  eyebrow,
  title,
  body,
  points,
  wide = false,
  text = 'body',
  as: Heading = 'h3',
  media,
}: FeatureCardLink &
  Readonly<{
    eyebrow?: ReactNode;
    title: ReactNode;
    body?: ReactNode;
    points?: readonly string[];
    wide?: boolean;
    text?: 'body' | 'lead';
    as?: 'h2' | 'h3';
    media?: ReactNode;
  }>) {
  const className = cn('cl-fcard', wide && 'cl-fcard--wide', href && 'focus-ring');
  const content = (
    <>
      {media}
      <div className="cl-fcard-body">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <Heading className="cl-fcard-title">{title}</Heading>
        {body && <p className="cl-fcard-text">{body}</p>}
        {points && points.length > 0 && <CheckList items={points} small={text === 'body'} />}
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

const BENTO_SPAN = {
  3: 'cl-span-3',
  4: 'cl-span-4',
  5: 'cl-span-5',
  6: 'cl-span-6',
  7: 'cl-span-7',
  8: 'cl-span-8',
  9: 'cl-span-9',
  12: 'cl-span-12',
} as const;

export type BentoSpan = keyof typeof BENTO_SPAN;

function spanBand(span: BentoSpan): 'small' | 'medium' | 'large' {
  if (span <= 3) return 'small';
  return span <= 8 ? 'medium' : 'large';
}

export function Bento({
  cells,
}: Readonly<{ cells: readonly Readonly<{ key: string; span: BentoSpan; content: ReactNode }>[] }>) {
  return (
    <div className="cl-bento">
      {cells.map((cell) => (
        <div
          key={cell.key}
          className={cn('cl-bento-cell', BENTO_SPAN[cell.span])}
          data-span-band={spanBand(cell.span)}
        >
          {cell.content}
        </div>
      ))}
    </div>
  );
}

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
  body?: string | readonly string[];
  points?: readonly string[];
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
