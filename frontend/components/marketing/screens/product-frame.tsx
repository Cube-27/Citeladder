import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import './product-frame.css';
import './screen-metal.css';

/**
 * How a product image fits its frame. `fluid`: a vignette (screen-vignette.tsx)
 * laid out at the well's width, text at real size, the frame at most 760px
 * wide and centred. `scale`: a full app screen laid out at its natural size
 * and scaled down whole to the well's width (CSS only, see `.cl-frame--scale`
 * in product-frame.css), never up; below 1280px drawn unscaled and cropped.
 */
export type FrameFit = 'fluid' | 'scale';

/**
 * ProductFrame: how every product image on the website is shown. On its own
 * it is one bordered card with the screen straight on it; the well's height
 * comes from the screen, so it never shows an empty band.
 *
 * Inside a FeatureCard the card's own border stands in for the frame's, and
 * the well becomes a grey inset holding the screen as a white card above the
 * card's copy.
 *
 * The screen is `inert` (no tab stops, out of the accessibility tree); `label`
 * describes it as one image.
 */
export function ProductFrame({
  children,
  label,
  fit = 'fluid',
  hero = false,
  title,
  caption,
}: Readonly<{
  /** The screen: a `Screen*` component. */
  children: ReactNode;
  /** What the screen shows, for screen readers. */
  label?: string;
  fit?: FrameFit;
  /**
   * The home page's main image: the screen drawn at full size, running to
   * the backdrop's foot with no padding under it.
   */
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
