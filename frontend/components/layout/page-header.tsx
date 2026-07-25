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
  ['/projects', 'Projects'],
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
 * PageHeader — the page title line, rendered inside the shell's 52px top bar.
 *
 * The v2 Figma shell restores the top bar that the flat phase had retired, so
 * this sits in its own chrome band again rather than in the content column.
 * Title is 15px/600 per the Figma top bar; it is the page's single `<h1>`.
 *
 * `summary` is the one-line sentence that follows the title on the same row
 * (e.g. the Visibility overview's "… is mentioned in 62% of answers"), and
 * `actions` is the right-aligned header slot for inline metrics or controls.
 * Both stay on one line inside the bar and truncate rather than wrap.
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
    <div className={cn('flex min-w-0 flex-1 items-center gap-3', className)}>
      <h1 className="text-foreground shrink-0 text-lg font-semibold tracking-tight">{resolved}</h1>
      {summary ? <p className="text-muted min-w-0 flex-1 truncate text-base">{summary}</p> : null}
      {actions ? <div className="ms-auto flex shrink-0 items-center gap-3">{actions}</div> : null}
    </div>
  );
}
