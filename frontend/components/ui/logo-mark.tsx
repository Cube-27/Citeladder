import Image from 'next/image';

import { cn } from '@/lib/utils';

/**
 * Official CiteLadder brand logo lockup.
 *
 * Uses the canonical SVG asset (`/citeladder-logo.svg`), which renders
 * vector-sharp across all resolutions and automatically locks its intrinsic aspect ratio.
 * Sizing is governed by the central `BRAND_LOGO_SIZES` ladder or explicit `size` prop.
 */

const LOGO_SRC = '/citeladder-logo.svg';
const LOGO_ASPECT = 662.356616 / 100;

export const BRAND_LOGO_SIZES = {
  brand: 18,
  sidebar: 18,
  compact: 16,
  mini: 14,
} as const;

export type BrandLogoVariant = keyof typeof BRAND_LOGO_SIZES;

export function LogoMark({
  size,
  variant = 'brand',
  wordmark = true,
  priority = false,
  alt = '',
  className,
}: Readonly<{
  size?: number;
  variant?: BrandLogoVariant;
  wordmark?: boolean;
  priority?: boolean;
  alt?: string;
  className?: string;
}>) {
  const resolvedSize = size ?? BRAND_LOGO_SIZES[variant];

  if (!wordmark) {
    return (
      <span
        className={cn('text-foreground inline-flex shrink-0 items-center', className)}
        aria-hidden={alt ? undefined : 'true'}
        aria-label={alt || undefined}
        role={alt ? 'img' : undefined}
      >
        <svg
          viewBox="0 0 98 100"
          width={resolvedSize}
          height={resolvedSize}
          aria-hidden="true"
          focusable="false"
          className="block shrink-0 fill-current"
        >
          <path d="M2.4 0 H53.8 C55.25 0 56.2 1.05 56.2 2.5 V8.6 C56.2 10.1 55.2 11.1 53.8 11.1 H11.85 V65.35 H31.6 C33.05 65.35 33.97 66.4 33.97 67.8 V84.8 L61.7 65.35 H95.5 C96.95 65.35 97.86 66.4 97.86 67.8 V73.75 C97.86 75.2 96.85 76.2 95.5 76.2 H64.7 L29.25 98.8 C26.25 100.85 23.0 99.55 23.0 96.45 V76.2 H2.4 C.95 76.2 0 75.15 0 73.75 V2.5 C0 1.05 .95 0 2.4 0 Z" />
          <rect
            x="30.25"
            y="41.31"
            width="19.86"
            height="18.96"
            rx="1.1"
            className="fill-primary"
          />
          <rect x="53.95" y="28.1" width="19.86" height="32.28" rx="1.1" className="fill-primary" />
          <rect x="78.1" y="14.11" width="19.76" height="46.27" rx="1.1" className="fill-primary" />
        </svg>
      </span>
    );
  }

  const width = Math.round(resolvedSize * LOGO_ASPECT);

  return (
    <span
      className={cn('inline-flex shrink-0 items-center select-none', className)}
      aria-hidden={alt ? undefined : 'true'}
    >
      <Image
        src={LOGO_SRC}
        alt={alt}
        width={width}
        height={resolvedSize}
        priority={priority}
        className="block h-auto w-auto object-contain"
        style={{ height: `${resolvedSize}px` }}
      />
    </span>
  );
}
