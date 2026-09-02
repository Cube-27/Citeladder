'use client';

import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

import { pageHeadingClasses } from '@/components/ui/typography';

import { resolveTitle } from './page-titles';

/**
 * PageHeader — the page's accessible label. The app shell places this owner in
 * the top bar, and it is the only call site.
 *
 * Route titles stay visible so every workspace has a stable orientation point.
 * Summary copy and action rows belong to the screen's own ruled section header,
 * so titling happens once, at one scale.
 */
export function PageHeader({
  title,
  showTitle,
  className,
}: Readonly<{
  /** Overrides the route-derived title (rare — prefer the table above). */
  title?: string;
  /** Allows an entity-owned screen to keep only its own visible title. */
  showTitle?: boolean;
  className?: string;
}>) {
  const pathname = usePathname() ?? '';
  const resolved = title ?? resolveTitle(pathname);
  const paintTitle = showTitle ?? !/^\/site\/crawls\/[^/]+\/pages\/[^/]+/.test(pathname);

  const heading = (
    <h1
      className={cn(
        paintTitle
          ? cn(pageHeadingClasses, 'min-w-0 flex-1 [overflow-wrap:break-word]')
          : 'sr-only',
      )}
    >
      {resolved}
    </h1>
  );

  // Explicitly hidden titles still retain the accessible page landmark.
  if (!paintTitle) return heading;

  return <div className={cn('flex min-w-0 flex-col', className)}>{heading}</div>;
}
