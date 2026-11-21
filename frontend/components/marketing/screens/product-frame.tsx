import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import './product-frame.css';
import './screen-metal.css';

export type FrameFit = 'fluid' | 'scale';

export function ProductFrame({
  children,
  label,
  fit = 'fluid',
  hero = false,
  title,
  caption,
}: Readonly<{
  children: ReactNode;
  label?: string;
  fit?: FrameFit;
  hero?: boolean;
  title?: ReactNode;
  caption?: ReactNode;
}>) {
  return (
    <figure className={cn('cl-frame', `cl-frame--${fit}`, hero && 'cl-frame--hero')}>
      <div className="cl-frame-card">
        <div // NOSONAR -- a live component screen shown as one picture, named by its label; <img> cannot hold it
          className="cl-frame-well"
          role={label ? 'img' : undefined}
          aria-label={label}
        >
          <div className="cl-frame-screen" inert>
            {children}
          </div>
        </div>
      </div>
      {(title || caption) && (
        <figcaption className="cl-frame-caption">
          {title && <span className="cl-frame-title">{title}</span>}
          {caption && <span className="cl-frame-text">{caption}</span>}
        </figcaption>
      )}
    </figure>
  );
}
