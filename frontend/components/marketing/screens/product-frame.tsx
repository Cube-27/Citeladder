import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** The well's ratio: hero 16:9, wide 16:10, standard 4:3, square 1:1, tall 3:4. */
export type FrameAspect = 'hero' | 'wide' | 'standard' | 'square' | 'tall';

/**
 * ProductFrame: how every product image on the website is shown. A white card
 * holds a paper well holding a real screen at 1:1 app scale; the well keeps
 * its ratio at every width and crops the screen, which never scales, so a
 * narrower well simply shows less of it. The screen sits `inset` px from the
 * well's top left and bleeds off the right and bottom edges.
 *
 * The screen is `inert` (no tab stops, out of the accessibility tree); `label`
 * describes it as one image.
 */
export function ProductFrame({
  children,
  aspect = 'wide',
  inset = 32,
  label,
  title,
  caption,
}: Readonly<{
  /** The screen: a `Screen*` component. */
  children: ReactNode;
  aspect?: FrameAspect;
  inset?: 24 | 32 | 48;
  /** What the screen shows, for screen readers. */
  label?: string;
  title?: ReactNode;
  caption?: ReactNode;
}>) {
  return (
    <figure className="cl-frame">
      <div className="cl-frame-card">
        <div
          className={cn('cl-frame-well', `cl-frame-well--${aspect}`)}
          role={label ? 'img' : undefined} // NOSONAR -- a live component crop shown as one picture, named by its label; <img> cannot hold it
          aria-label={label}
        >
          <div className={cn('cl-frame-screen', `cl-frame-screen--inset-${inset}`)} inert>
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
