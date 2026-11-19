import { useId, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react';

import { ButtonLink } from '../primitives/button';
import { Eyebrow } from './site-parts';
import './card-rail.css';

/**
 * RailCard: one card of a CardRail. Its label and headline (a link to the
 * card's page, so it works without script) sit at the top beside a plus
 * button; its product image, a miniature, sits below, inset, with the card's
 * foot 24px under it; the row's cards share the tallest card's height.
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
            {/* The track scrolls and the card clips, so its rings draw inside. */}
            <a href={href} className="cl-railcard-link focus-ring-inset">
              {title}
            </a>
          </h3>
        </div>
        <button
          type="button"
          className="cl-railcard-toggle focus-ring-inset"
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
        <ButtonLink href={href}>Explore {label}</ButtonLink>
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
      <output className="sr-only" data-card-rail-status />
    </div>
  );
}
