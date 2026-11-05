import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Breadcrumbs, type Crumb } from '../chrome/breadcrumbs';
import { Eyebrow } from './site-parts';

/**
 * PageHero: an inner page's opening, its H1 at display-2xl (44, 36 on
 * tablets, 30 on phones, never larger), the lead, actions, a mono meta line
 * and the page's product image below. `size` only changes the measure.
 */
export function PageHero({
  crumbs,
  eyebrow,
  title,
  lead,
  actions,
  meta,
  size = 'lg',
  children,
}: Readonly<{
  crumbs?: readonly Crumb[];
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  size?: 'lg' | '2xl';
  /** The hero's product image, under the copy. */
  children?: ReactNode;
}>) {
  return (
    <section className={cn('cl-phero', `cl-phero--${size}`)}>
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
 * LandingHero: the home page's opening. The announcement sits over the H1,
 * then the lead, actions and note; the frame goes below the copy (or beside
 * it, 5/12 to 7/12). Centred copy only applies with the frame below.
 */
export function LandingHero({
  announcement,
  title,
  lead,
  actions,
  note,
  frame,
  layout = 'below',
  align = 'left',
}: Readonly<{
  announcement?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  note?: ReactNode;
  frame?: ReactNode;
  layout?: 'below' | 'beside';
  align?: 'left' | 'center';
}>) {
  const center = layout === 'below' && align === 'center';
  return (
    <section className={cn('cl-lhero', `cl-lhero--${layout}`, center && 'cl-lhero--center')}>
      <div className="cl-container">
        <div className="cl-lhero-grid">
          <div className="cl-lhero-copy">
            {announcement}
            <h1 className="cl-lhero-title">{title}</h1>
            {lead && <p className="cl-lead cl-lhero-lead">{lead}</p>}
            {actions && <div className="cl-lhero-actions">{actions}</div>}
            {note && <p className="cl-lhero-note">{note}</p>}
          </div>
          {frame && <div className="cl-lhero-frame">{frame}</div>}
        </div>
      </div>
    </section>
  );
}
