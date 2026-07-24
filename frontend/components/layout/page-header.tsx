'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Route → page title map. Exact paths first; dynamic segments are resolved by
 * longest-prefix match in `resolveTitle`. Titles live here (not on the pages
 * themselves) so there is a single title surface for the whole authed area.
 *
 * Copy is sentence case and plain language: product nouns keep their
 * capitalisation, everything else reads like a sentence.
 */
const PAGE_TITLES: ReadonlyArray<readonly [prefix: string, title: string]> = [
  ['/visibility', 'Overview'],
  ['/analytics', 'Answers'],
  ['/traffic', 'Traffic'],
  ['/prompts', 'Prompts'],
  ['/products', 'Products'],
  ['/runs', 'Runs'],
  ['/content', 'Content'],
  ['/setup', 'Setup'],
  ['/knowledge-base', 'Brand knowledge'],
  ['/site-health', 'Site health'],
  ['/issues', 'Issues'],
  ['/settings', 'Settings'],
  ['/providers', 'Settings'],
];

/** Deeper-route overrides (checked before the prefix table). */
const EXACT_OVERRIDES: ReadonlyArray<readonly [pattern: RegExp, title: string]> = [
  [/^\/runs\/[^/]+\/executions\/[^/]+$/, 'Execution evidence'],
  [/^\/runs\/[^/]+$/, 'Run detail'],
];

export function resolveTitle(pathname: string): string {
  for (const [pattern, title] of EXACT_OVERRIDES) {
    if (pattern.test(pathname)) return title;
  }
  for (const [prefix, title] of PAGE_TITLES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return title;
  }
  return 'Searchify';
}

/**
 * PageHeader — the page title line inside the content column.
 *
 * Replaces the retired 52px TopBar: the flat language starts the content
 * region at the top of the frame, so the title sits with the content it names
 * rather than in its own chrome band. Renders the page's single `<h1>`.
 *
 * `summary` is the one-line sentence that follows the title on the same row
 * (e.g. the Visibility overview's "… is mentioned in 62% of answers"), and
 * `actions` is the right-aligned slot for inline metrics or controls.
 */
export function PageHeader({
  summary,
  actions,
  title,
  className,
}: Readonly<{
  summary?: ReactNode;
  actions?: ReactNode;
  /** Overrides the route-derived title (rare — prefer the table above). */
  title?: string;
  className?: string;
}>) {
  const pathname = usePathname() ?? '';
  const resolved = title ?? resolveTitle(pathname);

  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-1', className)}>
      <h1 className="text-foreground text-xl font-semibold tracking-[-0.02em]">{resolved}</h1>
      {summary ? <p className="text-muted min-w-0 flex-1 text-base">{summary}</p> : null}
      {actions ? <div className="ms-auto flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}
