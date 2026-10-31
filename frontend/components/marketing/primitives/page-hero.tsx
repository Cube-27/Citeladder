import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Container } from './section';

export type Crumb = Readonly<{ label: string; href?: string }>;

/**
 * Subpage opener. Every marketing route that is not `/` starts with exactly
 * this block, so /pricing, /faq, /solutions and the rest share one entry
 * rhythm instead of each inventing its own hero height and measure.
 *
 * The optional trail is real wayfinding (it mirrors the page's breadcrumb
 * structured data), not a label above the heading.
 */
export function PageHero({
  title,
  lead,
  children,
  breadcrumb,
  centered = false,
}: Readonly<{
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
  breadcrumb?: readonly Crumb[];
  centered?: boolean;
}>) {
  return (
    <header className="site-band relative">
      <Container
        className={cn(
          // Centred on a phone on every page (owner, 2026-10-31); from 640px only
          // a centred hero stays centred.
          'mk-hero-in items-center gap-0 text-center md:gap-0',
          !centered && 'sm:items-start sm:text-start',
        )}
      >
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol
              className={cn(
                'website-label text-muted flex flex-wrap items-center justify-center gap-1.5',
                !centered && 'sm:justify-start',
              )}
            >
              {breadcrumb.map((crumb, index) => (
                <li key={crumb.label} className="inline-flex items-center gap-1.5">
                  {index > 0 && <ChevronRight aria-hidden className="size-3.5 opacity-60" />}
                  {crumb.href ? (
                    <a className="hover:text-foreground transition-colors" href={crumb.href}>
                      {crumb.label}
                    </a>
                  ) : (
                    <span aria-current="page" className="text-foreground">
                      {crumb.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1
          className={cn(
            'website-page-title text-foreground mx-auto max-w-[30ch] text-balance',
            !centered && 'sm:mx-0',
          )}
        >
          {title}
        </h1>
        {lead && (
          <p className={cn('website-lead mx-auto mt-5 max-w-[72ch]', !centered && 'sm:mx-0')}>
            {lead}
          </p>
        )}
        {children}
      </Container>
    </header>
  );
}
