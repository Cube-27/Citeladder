import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Eyebrow } from './label';
import { Container } from './section';
import { Reveal } from './reveal';

/**
 * Subpage opener. Every marketing route that is not `/` starts with exactly
 * this block, so /pricing, /faq, /solutions and the rest share one entry
 * rhythm instead of each inventing its own hero height and measure.
 */
export function PageHero({
  eyebrow,
  title,
  accent,
  lead,
  children,
  centered = false,
}: Readonly<{
  eyebrow: string;
  title: ReactNode;
  /** Trailing clause rendered in the display accent — optional by design. */
  accent?: string;
  lead?: ReactNode;
  children?: ReactNode;
  centered?: boolean;
}>) {
  return (
    <header className="mkt-field-hero mkt-grid-field pt-mkt-70 pb-mkt-70 md:pt-mkt-100 md:pb-mkt-80 relative overflow-hidden">
      <Container className="relative z-1">
        <Reveal className={cn('max-w-5xl', centered && 'mx-auto text-center')}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1
            className={cn(
              'font-mkt-display text-mkt-h1 text-mkt-ink mt-mkt-30 mb-mkt-30 max-w-[32ch]',
              centered && 'mx-auto',
            )}
          >
            {title}
            {accent && (
              <>
                {' '}
                <em className="mkt-keyword not-italic">{accent}</em>
              </>
            )}
          </h1>
          {lead && (
            <p
              className={cn('text-mkt-lead text-mkt-ink-soft max-w-[80ch]', centered && 'mx-auto')}
            >
              {lead}
            </p>
          )}
          {children}
        </Reveal>
      </Container>
    </header>
  );
}
