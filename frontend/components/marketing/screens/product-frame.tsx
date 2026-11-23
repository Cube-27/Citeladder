import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import './product-frame.css';

export type FrameFit = 'fluid' | 'scale';

export function ProductFrame({
  children,
  label,
  fit = 'fluid',
  stage = false,
  title,
  caption,
}: Readonly<{
  children: ReactNode;
  label?: string;
  fit?: FrameFit;
  stage?: boolean;
  title?: ReactNode;
  caption?: ReactNode;
}>) {
  return (
    <figure className={cn('cl-frame', `cl-frame--${fit}`, stage && 'cl-frame--stage')}>
      <div className="cl-frame-card">
        <div // NOSONAR
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
