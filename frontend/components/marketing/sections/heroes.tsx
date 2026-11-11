import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Breadcrumbs, type Crumb } from '../chrome/breadcrumbs';
import './heroes.css';

/**
 * PageHero: an inner page's opening, its H1 the site title (80, 32 on
 * phones) or, for a reading page such as the blog, the section size (56, 28
 * on phones; D36), then the lead, actions, a meta line and the page's product
 * image below. Landing pages centre the copy (D18); long-form and utility
 * pages pass `align="left"`. `size` only changes the measure of a
 * left-aligned hero. `entrance` gives a landing page's copy the one load-in
 * the website keeps (D36).
 */
export function PageHero({
  crumbs,
  title,
  lead,
  actions,
  meta,
  size = 'lg',
  align = 'center',
  titleSize = 'hero',
  entrance = false,
  children,
}: Readonly<{
  crumbs?: readonly Crumb[];
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  size?: 'lg' | '2xl';
  align?: 'left' | 'center';
  titleSize?: 'hero' | 'section';
  entrance?: boolean;
  /** The hero's product image, under the copy. */
  children?: ReactNode;
}>) {
  return (
    // `data-cta-placement` names where a clicked call to action sat, for marketing analytics.
    <section
      className={cn(
        'cl-phero',
        `cl-phero--${size}`,
        align === 'center' && 'cl-phero--center',
        titleSize === 'section' && 'cl-phero--reading',
      )}
      data-cta-placement="hero"
    >
      <div className="cl-container">
        <div className={cn('cl-phero-inner', entrance && 'mk-hero-in')}>
          {crumbs && <Breadcrumbs items={crumbs} />}
          <h1 className="cl-phero-title">{title}</h1>
          {lead && <p className="cl-lead cl-phero-lead">{lead}</p>}
          {actions && <div className="cl-phero-actions">{actions}</div>}
          {meta && <p className="cl-phero-meta">{meta}</p>}
        </div>
        {children && <div className="cl-phero-media">{children}</div>}
      </div>
    </section>
  );
}

/**
 * LandingHero: the home page's opening, centred (D18). The announcement sits
 * over the H1, then the lead, actions and note; the frame goes below the copy.
 * Its copy loads in (D36); the frame is static. With an `aside` (D52) the
 * hero splits from 1280px: the copy left-aligned, the aside to its right; on
 * narrower screens the aside sits under the centred copy.
 */
export function LandingHero({
  announcement,
  title,
  lead,
  actions,
  note,
  aside,
  frame,
}: Readonly<{
  announcement?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  note?: ReactNode;
  aside?: ReactNode;
  frame?: ReactNode;
}>) {
  return (
    <section className={cn('cl-lhero', aside && 'cl-lhero--split')}>
      <div className="cl-container">
        <div className="cl-lhero-copy mk-hero-in">
          {announcement}
          <h1 className="cl-lhero-title">{title}</h1>
          {lead && <p className="cl-lead cl-lhero-lead">{lead}</p>}
          {actions && <div className="cl-lhero-actions">{actions}</div>}
          {note && <p className="cl-lhero-note">{note}</p>}
        </div>
        {aside && <div className="cl-lhero-aside">{aside}</div>}
        {frame && <div className="cl-lhero-frame">{frame}</div>}
      </div>
    </section>
  );
}
