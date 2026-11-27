import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Breadcrumbs, type Crumb } from '../chrome/breadcrumbs';
import './heroes.css';

const HERO_SIZE = { lg: 'cl-phero--lg', '2xl': 'cl-phero--2xl' } as const;

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
  children?: ReactNode;
}>) {
  return (
    <section
      className={cn('cl-phero', HERO_SIZE[size], children && 'cl-phero--split')}
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
