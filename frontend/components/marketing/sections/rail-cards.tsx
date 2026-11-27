import { useId, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Plus } from '@/lib/icons';

import { ButtonLink } from '../primitives/button';
import { Eyebrow } from './site-parts';
import './card-rail.css';
import { Icon } from '@/components/ui/icon';

export function RailCard({
  href,
  label,
  title,
  body,
  media,
  page,
}: Readonly<{
  href: string;
  label: string;
  title: ReactNode;
  body: ReactNode;
  media: ReactNode;
  page: ReactNode;
}>) {
  const moreId = useId();
  return (
    <article className="cl-railcard" data-rail-card>
      <div className="cl-railcard-head">
        <div className="cl-railcard-copy">
          <Eyebrow>{label}</Eyebrow>
          <h3 className="cl-railcard-title">
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
          <Icon icon={Plus} size="lead" />
        </button>
      </div>
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

export function CardRail({
  label,
  head,
  items,
}: Readonly<{
  label: string;
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
            <Icon icon={ArrowLeft} size="lead" />
          </button>
          <button
            type="button"
            className="cl-rail-btn focus-ring"
            aria-label={`Next ${label}`}
            data-card-rail-next
          >
            <Icon icon={ArrowRight} size="lead" />
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
