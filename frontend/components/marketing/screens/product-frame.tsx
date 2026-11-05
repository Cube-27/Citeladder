import type { ReactNode } from 'react';

/**
 * ProductFrame: how every product image on the website is shown. A bordered
 * card holds a paper well holding a real screen, scaled down to fit the well's
 * width: the whole screen is always visible and nothing is cropped. The well
 * takes the screen's own ratio plus even padding, so a narrower well shows the
 * same screen smaller. The fit is CSS only (container query units, see
 * `.cl-frame-screen` in screens.css), so static output needs no script and
 * never shifts layout. Screens never scale above their natural size.
 *
 * Inside a FeatureCard the card's own border stands in for the frame's: the
 * well sits directly in the feature card.
 *
 * The screen is `inert` (no tab stops, out of the accessibility tree); `label`
 * describes it as one image.
 */
export function ProductFrame({
  children,
  label,
  title,
  caption,
}: Readonly<{
  /** The screen: a `Screen*` component. */
  children: ReactNode;
  /** What the screen shows, for screen readers. */
  label?: string;
  title?: ReactNode;
  caption?: ReactNode;
}>) {
  return (
    <figure className="cl-frame">
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
