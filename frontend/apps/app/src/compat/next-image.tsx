import { forwardRef, type CSSProperties, type ImgHTMLAttributes } from 'react';

type StaticImageData = {
  src: string;
};

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'height' | 'src' | 'width'> & {
  alt: string;
  fill?: boolean;
  height?: number;
  priority?: boolean;
  quality?: number;
  sizes?: string;
  src: StaticImageData | string;
  unoptimized?: boolean;
  width?: number;
};

const fillStyle: CSSProperties = {
  bottom: 0,
  height: '100%',
  left: 0,
  position: 'absolute',
  right: 0,
  top: 0,
  width: '100%',
};

/**
 * Browser-only replacement for the static and fill layouts used by the Vite
 * routes. The browser loads image sources directly; no Next image optimizer is
 * involved.
 */
/* oxlint-disable next/no-img-element -- The Vite runtime has no Next image optimizer. */
const Image = forwardRef<HTMLImageElement, ImageProps>(function Image(
  {
    alt,
    fill = false,
    height,
    priority = false,
    quality: _quality,
    sizes,
    src,
    style,
    unoptimized: _unoptimized,
    width,
    ...props
  },
  ref,
) {
  const resolvedSrc = typeof src === 'string' ? src : src.src;

  return (
    <img
      alt={alt}
      {...props}
      ref={ref}
      src={resolvedSrc}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      sizes={sizes}
      fetchPriority={priority ? 'high' : undefined}
      style={fill ? { ...fillStyle, ...style } : style}
    />
  );
});
/* oxlint-enable next/no-img-element */

export default Image;
