import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Breadcrumbs, type Crumb } from '../chrome/breadcrumbs';
import './heroes.css';

/**
 * PageHero: an inner page's opening, its H1 the site title (48, 32 on
 * phones), then the lead, a meta line, the actions and the page's product
 * image below, left-aligned on the page's column edge. Without an image the
 * lead, meta and actions sit right of the title from 1024px; with one, from
 * 1280px the image sits beside the copy (5/12 copy, 7/12 image). `size` only changes the
 * title's measure. `entrance` gives a landing page's copy the one load-in
 * the website keeps.
 */
export function PageHero({
  crumbs,
  title,
  lead,
  actions,
  meta,
  size = 'lg',
  entrance = false,
  children,
}: Readonly<{
  crumbs?: readonly Crumb[];
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  size?: 'lg' | '2xl';
  entrance?: boolean;
  /** The hero's product image, under the copy or beside it from 1280px. */
  children?: ReactNode;
}>) {
  return (
    // `data-cta-placement` names where a clicked call to action sat, for marketing analytics.
    <section
      className={cn('cl-phero', `cl-phero--${size}`, children && 'cl-phero--split')}
      data-cta-placement="hero"
    >
      <div className="cl-container">
        <div className={cn('cl-phero-inner', entrance && 'mk-hero-in')}>
          <div className="cl-phero-head">
            {crumbs && <Breadcrumbs items={crumbs} />}
            <h1 className="cl-phero-title">{title}</h1>
          </div>
          {(lead || meta || actions) && (
            <div className="cl-phero-side">
              {lead && <p className="cl-lead cl-phero-lead">{lead}</p>}
              {meta && <p className="cl-phero-meta">{meta}</p>}
              {actions && <div className="cl-phero-actions">{actions}</div>}
            </div>
          )}
        </div>
        {children && <div className="cl-phero-media">{children}</div>}
      </div>
    </section>
  );
}

/**
 * LandingHero: the home page's opening. The announcement sits over the H1;
 * the lead, note and actions follow it, and from 1024px sit right of it. The
 * frame goes below the copy. Its copy loads in; the frame is static.
 */
export function LandingHero({
  announcement,
  title,
  lead,
  actions,
  note,
  frame,
}: Readonly<{
  announcement?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  note?: ReactNode;
  frame?: ReactNode;
}>) {
  return (
    <section className="cl-lhero">
      <div className="cl-container">
        <div className="cl-lhero-copy mk-hero-in">
          <div className="cl-lhero-head">
            {announcement}
            <h1 className="cl-lhero-title">{title}</h1>
          </div>
          {(lead || note || actions) && (
            <div className="cl-lhero-side">
              {lead && <p className="cl-lead cl-lhero-lead">{lead}</p>}
              {note && <p className="cl-lhero-note">{note}</p>}
              {actions && <div className="cl-lhero-actions">{actions}</div>}
            </div>
          )}
        </div>
        {frame && <div className="cl-lhero-frame">{frame}</div>}
      </div>
    </section>
  );
}
