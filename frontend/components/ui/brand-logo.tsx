'use client';

import Image from 'next/image';
import { useState } from 'react';

import { cn } from '@/lib/utils';

const SIZE = {
  xs: { pixels: 16, className: 'size-4 rounded-[3px] text-[8px]' },
  sm: { pixels: 24, className: 'size-6 rounded text-2xs' },
  md: { pixels: 32, className: 'size-8 rounded-md text-xs' },
} as const;

export function brandInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * One brand-avatar treatment everywhere: cached favicon when available,
 * deterministic initials when absent or broken. It is decorative because the
 * adjacent brand name carries the accessible label.
 */
export function BrandLogo({
  name,
  logoUrl,
  size = 'sm',
  className,
}: Readonly<{
  name: string;
  logoUrl?: string | null;
  size?: keyof typeof SIZE;
  className?: string;
}>) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const spec = SIZE[size];
  const showImage = Boolean(logoUrl && failedUrl !== logoUrl);

  return (
    <span
      aria-hidden
      className={cn(
        'bg-accent-soft text-accent-text relative grid shrink-0 place-items-center overflow-hidden font-semibold uppercase',
        spec.className,
        className,
      )}
    >
      {showImage && logoUrl ? (
        <Image
          src={logoUrl}
          alt=""
          width={spec.pixels}
          height={spec.pixels}
          unoptimized
          className="bg-panel size-full object-contain p-[2px]"
          onError={() => setFailedUrl(logoUrl)}
        />
      ) : (
        brandInitials(name)
      )}
    </span>
  );
}
