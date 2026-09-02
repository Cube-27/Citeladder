import type { ReactNode } from 'react';

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
}: Readonly<{
  eyebrow: string;
  title: ReactNode;
  /** Trailing clause rendered in the display accent — optional by design. */
  accent?: string;
  lead?: ReactNode;
  children?: ReactNode;
}>) {
  return (
    <header className="bg-background-alt border-border-subtle relative overflow-hidden border-b pt-16 pb-16 md:pt-30 md:pb-20">
      <Container className="relative z-1">
        <Reveal className="max-w-5xl">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="website-page-title text-foreground mt-6 mb-6 max-w-[28ch] text-balance">
            {title}
            {accent && (
              <>
                {' '}
                <em className="text-accent-text not-italic">{accent}</em>
              </>
            )}
          </h1>
          {lead && <p className="website-lead text-muted max-w-[75ch]">{lead}</p>}
          {children}
        </Reveal>
      </Container>
    </header>
  );
}
