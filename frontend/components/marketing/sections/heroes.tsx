import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Breadcrumbs, type Crumb } from '../chrome/breadcrumbs';
import { Eyebrow } from './site-parts';

/**
 * PageHero: an inner page's opening, its H1 at display-2xl (44, 42 from
 * 768 to 1023px, 30 on phones, never larger), the lead, actions, a mono meta line
 * and the page's product image below. Landing pages centre the copy (D18);
 * long-form and utility pages pass `align="left"`. `size` only changes the
 * measure of a left-aligned hero.
 */
export function PageHero({
  crumbs,
  eyebrow,
  title,
  lead,
  actions,
  meta,
  size = 'lg',
  align = 'center',
  children,
}: Readonly<{
  crumbs?: readonly Crumb[];
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  size?: 'lg' | '2xl';
  align?: 'left' | 'center';
  /** The hero's product image, under the copy. */
  children?: ReactNode;
}>) {
  return (
    // `data-cta-placement` names where a clicked call to action sat, for marketing analytics.
    <section
      className={cn('cl-phero', `cl-phero--${size}`, align === 'center' && 'cl-phero--center')}
      data-cta-placement="hero"
    >
      <div className="cl-container">
        <div className="cl-phero-inner">
          {crumbs && <Breadcrumbs items={crumbs} />}
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
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
        <div className="cl-lhero-copy">
          {announcement}
          <h1 className="cl-lhero-title">{title}</h1>
          {lead && <p className="cl-lead cl-lhero-lead">{lead}</p>}
          {actions && <div className="cl-lhero-actions">{actions}</div>}
          {note && <p className="cl-lhero-note">{note}</p>}
        </div>
        {frame && <div className="cl-lhero-frame">{frame}</div>}
      </div>
    </section>
  );
}
