'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { eyebrowClasses } from '@/components/ui/eyebrow';

import { resolveTitle } from './page-titles';

/**
 * PageHeader — the page title block, rendered as the first row of the content
 * column (it no longer lives in the shell's 48px chrome bar, which could not
 * hold a real ADS header).
 *
 * ADS PageHeader recipe: the title is the page's single `<h1>` at H-L (24/28,
 * `text-xl`), wrapping with `overflow-wrap: break-word` instead of truncating;
 * the actions slot pins to the inline end (`ms-auto`, `shrink-0`, 32px inline
 * padding); the summary is a real description block that wraps at a 70ch
 * measure in `text-secondary`. An optional `eyebrow` slot sits above the title
 * as the dependency-free stand-in for ADS's breadcrumb row.
 *
 * No block-end margin here — the content grid's `gap-[var(--card-gap)]`
 * (16px) supplies it.
 */
export function PageHeader({
  summary,
  actions,
  title,
  eyebrow,
  className,
}: Readonly<{
  summary?: ReactNode;
  actions?: ReactNode;
  /** Overrides the route-derived title (rare — prefer the table above). */
  title?: string;
  /** Optional overline above the title (ADS breadcrumb-row stand-in). */
  eyebrow?: ReactNode;
  className?: string;
}>) {
  const pathname = usePathname() ?? '';
  const resolved = title ?? resolveTitle(pathname);

  return (
    <div className={cn('flex flex-col gap-1 pb-1', className)}>
      {eyebrow ? <p className={eyebrowClasses}>{eyebrow}</p> : null}
      <div className="flex flex-nowrap items-start gap-2">
        <h1 className="font-mkt-display text-foreground min-w-0 flex-1 text-2xl font-bold [overflow-wrap:break-word]">
          {resolved}
        </h1>
        {actions ? (
          <div className="ms-auto flex shrink-0 items-center gap-2 ps-8">{actions}</div>
        ) : null}
      </div>
      {summary ? (
        <p className="text-muted max-w-[70ch] text-sm leading-relaxed">{summary}</p>
      ) : null}
    </div>
  );
}
