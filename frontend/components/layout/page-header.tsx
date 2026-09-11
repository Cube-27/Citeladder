'use client';

import { usePathname } from 'next/navigation';
import { useContext, useLayoutEffect, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { textRole } from '@/components/ui/typography';

import { resolveTitle } from './page-titles';
import { CompactPageTitleContext } from './compact-page-title-context';

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
  const setCompactTitle = useContext(CompactPageTitleContext);

  useLayoutEffect(() => {
    if (!setCompactTitle || title === undefined) return;
    setCompactTitle(title);
    return () => {
      setCompactTitle((current) => (current === title ? undefined : current));
    };
  }, [setCompactTitle, title]);

  return (
    <header
      className={cn(
        'flex min-w-0 flex-col gap-[var(--page-header-gap)] pt-[var(--page-header-padding-top)] pb-[var(--page-header-padding-bottom)] min-[701px]:flex-row min-[701px]:items-center min-[701px]:justify-between',
        // Desktop: one 56px band, the same height as the sidebar's first row,
        // so the route title sits on the project switcher's line instead of
        // starting a row of its own below it.
        'min-[981px]:min-h-[var(--compact-topbar-height)] min-[981px]:pt-0',
        !description && !actions && 'max-[700px]:hidden',

        className,
      )}
    >
      <div className="min-w-0 flex-1 max-[700px]:sr-only">
        {/* The route H1 sits at the object-title rung, not the 26px page-title
            rung. At 26px it was the largest thing on every screen and competed
            with the work below it for first read; the shell's rail and header
            already say where the reader is, so the heading labels the pane
            rather than announcing it. It stays the one H1 per route. */}
        <h1 className={textRole('objectTitle', 'min-w-0 [overflow-wrap:break-word]')}>
          {resolved}
        </h1>
        {description ? (
          <div className="text-secondary mt-[var(--page-header-heading-gap)] max-w-[700px] text-sm leading-[22px]">
            {description}
          </div>
        ) : null}
      </div>
      {actions ? (
        // The shell paints the account glyph at the end of this same row, so
        // route actions reserve its width instead of running underneath it.
        // The reservation is desktop-only, because that is the only width the
        // glyph appears at; the compact topbar owns it below 981px.
        <div className="flex min-h-[var(--control-height)] shrink-0 flex-wrap items-center gap-2 min-[981px]:pe-[calc(var(--control-height)+0.75rem)]">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
