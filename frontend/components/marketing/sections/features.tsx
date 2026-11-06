import { useId, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';

import { ButtonLink } from '../primitives/button';
import { CheckList, Eyebrow, SiteArrowLink } from './site-parts';

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
 * RailCard: one card of a CardRail. Its label and headline (a link to the
 * card's page, so it works without script) sit at the top beside a plus
 * button; its product image, a miniature, sits below, inset and cut off by
 * the card's foot, so every card is one height whatever its screen holds.
 *
 * The plus (or a press anywhere on the card) opens it in place
 * (`mountCardRail`): the card widens to the right, to 720px, and the plus
 * turns to a close, while the header stays put; the miniature fades out as the `body`
 * with a button to the page fades in at the lower left and the feature's
 * `page` in the app, sidebar and all, at the right. Closing fades back. The
 * height never changes, so nothing below the rail moves. On a phone the rail
 * is a list of names, each opening in place.
 */
export function RailCard({
  href,
  label,
  title,
  body,
  media,
  page,
}: Readonly<{
  href: string;
  /** What the card is (a module's name), small above the headline. */
  label: string;
  title: ReactNode;
  /** The paragraph an open card shows. */
  body: ReactNode;
  /** The closed card's miniature: a ProductFrame of the feature's screen. */
  media: ReactNode;
  /** The open card's image: a ProductFrame of the feature's page in the app, sidebar and all. */
  page: ReactNode;
}>) {
  const moreId = useId();
  return (
    <article className="cl-railcard" data-rail-card>
      <div className="cl-railcard-head">
        <div className="cl-railcard-copy">
          <Eyebrow>{label}</Eyebrow>
          <h3 className="cl-railcard-title">
            <a href={href} className="cl-railcard-link focus-ring">
              {title}
            </a>
          </h3>
        </div>
        <button
          type="button"
          className="cl-railcard-toggle focus-ring"
          aria-expanded={false}
          aria-controls={moreId}
          aria-label={`More about ${label}`}
          data-label={label}
          data-rail-toggle
        >
          <Plus aria-hidden className="size-5" />
        </button>
      </div>
      {/* Three layers under the fixed header, cross-faded by `data-expanded`:
          the miniature while closed; the page and the paragraph with its
          button while open. On a phone the card is a list row that opens to
          the miniature, paragraph and button. */}
      <div className="cl-railcard-shot">{media}</div>
      <div className="cl-railcard-page" aria-hidden inert>
        {page}
      </div>
      <div id={moreId} className="cl-railcard-more" aria-hidden inert>
        <p className="cl-railcard-body">{body}</p>
        <ButtonLink href={href} size="marketing">
          Explore {label}
        </ButtonLink>
      </div>
    </article>
  );
}

/**
 * CardRail: one row of fixed-width cards that scrolls sideways and snaps to
 * each card, with previous and next buttons at the right of its heading
 * row. The page mounts the buttons with `mountCardRail` (card-rail.ts);
 * until then they hold their space hidden and the row still scrolls by
 * touch, trackpad or keyboard.
 */
export function CardRail({
  label,
  head,
  items,
}: Readonly<{
  /** What the cards are, naming the list and its buttons ("modules"). */
  label: string;
  /** The section's header (a SectionHeader), beside the buttons. */
  head?: ReactNode;
  items: readonly Readonly<{ key: string; content: ReactNode }>[];
}>) {
  return (
    <div className="cl-rail" data-card-rail>
      <div className="cl-rail-top">
        {head}
        <div className="cl-rail-nav" data-card-rail-nav>
          <button
            type="button"
            className="cl-rail-btn focus-ring"
            aria-label={`Previous ${label}`}
            data-card-rail-prev
          >
            <ArrowLeft aria-hidden className="size-5" />
          </button>
          <button
            type="button"
            className="cl-rail-btn focus-ring"
            aria-label={`Next ${label}`}
            data-card-rail-next
          >
            <ArrowRight aria-hidden className="size-5" />
          </button>
        </div>
      </div>
      <ul className="cl-rail-track" aria-label={label} data-card-rail-track>
        {items.map((item) => (
          <li key={item.key} className="cl-rail-item">
            {item.content}
          </li>
        ))}
      </ul>
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
