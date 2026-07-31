'use client';

import type { RootError } from '@/lib/api/types';

/**
 * Root-failure block for the Errors & Blocked tab (SH-4 — B3).
 *
 * When the crawl's START URL itself failed, no page row exists to list — the
 * failure's only evidence is the terminal root-target fetch attempts the
 * worker persisted, one per REAL network call. These rows are deliberately
 * NON-clickable and carry no `site_url_id`: the URL was never admitted into
 * the inventory, so there is no PageDetail behind them.
 */
export function RootErrorsBlock({ errors }: Readonly<{ errors: RootError[] }>) {
  if (errors.length === 0) return null;
  return (
    <div className="grid gap-2" data-testid="root-errors-block">
      <p className="text-secondary text-sm">
        The start URL could not be fetched — the crawl never reached any page. Each row is one
        network call the crawler made.
      </p>
      <ul className="grid gap-1">
        {errors.map((error, index) => (
          <li
            key={`${error.target}:${index}`}
            data-testid="root-error-row"
            className="border-border-subtle bg-background-alt flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2"
          >
            <span className="mono text-foreground text-sm font-semibold">{error.method}</span>
            <span className="mono text-muted min-w-0 flex-1 truncate text-sm">{error.target}</span>
            {error.error_code ? (
              <span className="mono text-danger-text text-sm">{error.error_code}</span>
            ) : null}
            <span className="mono text-muted text-sm">
              {error.status_code !== null ? `HTTP ${error.status_code}` : '—'}
            </span>
            <span className="mono text-muted text-sm">
              {error.latency_ms !== null ? `${error.latency_ms} ms` : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
