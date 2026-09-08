'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { textRole } from '@/components/ui/typography';

import { resolveTitle } from './page-titles';

/**
 * PageHeader — the route-owned in-pane label. Entity detail keeps its own
 * truthful heading rather than receiving a duplicate shell title.
 *
 * Each route composes its own summary and action controls here, alongside the
 * stateful owner that already governs them. The shell never supplies actions.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: Readonly<{
  /** Overrides the route-derived title (rare — prefer the table above). */
  title?: string;
  /** Route-owned supporting copy, kept with its heading at every data state. */
  description?: ReactNode;
  /** Route-owned controls; their state and outcomes remain in the route owner. */
  actions?: ReactNode;
  className?: string;
}>) {
  const pathname = usePathname() ?? '';
  const resolved = title ?? resolveTitle(pathname);
  return (
    <header
      className={cn(
        'flex min-w-0 flex-col gap-[var(--page-header-gap)] pt-[var(--page-header-padding-top)] pb-[var(--page-header-padding-bottom)] min-[701px]:flex-row min-[701px]:items-start min-[701px]:justify-between',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h1 className={textRole('pageTitle', 'min-w-0 [overflow-wrap:break-word]')}>{resolved}</h1>
        {description ? (
          <div className="text-secondary mt-[var(--page-header-heading-gap)] max-w-[700px] text-sm leading-[22px]">
            {description}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex min-h-[var(--control-height)] shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
