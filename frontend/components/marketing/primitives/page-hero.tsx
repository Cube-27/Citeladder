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
    <header className="pt-16 pb-12 md:pt-24 md:pb-16">
      <Container>
        <Reveal className={cn('max-w-3xl', centered && 'mx-auto text-center')}>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1
            className={cn(
              'font-mkt-display text-mkt-d1 text-mkt-ink mt-6 mb-6 max-w-[18ch] font-medium',
              centered && 'mx-auto',
            )}
          >
            {title}
            {accent && (
              <>
                {' '}
                <em className="text-mkt-proof not-italic">{accent}</em>
              </>
            )}
          </h1>
          {lead && (
            <p
              className={cn('text-mkt-lead text-mkt-ink-soft max-w-[56ch]', centered && 'mx-auto')}
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
