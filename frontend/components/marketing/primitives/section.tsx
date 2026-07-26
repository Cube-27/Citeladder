import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Reveal } from './reveal';

/**
 * Vertical rhythm for the whole Proof surface. Sections NEVER set their own
 * top/bottom padding — the three densities live here, so every page on the
 * marketing/auth surface breathes identically. This is the single reason the
 * deck's per-section padding values (112 / 64 / 58 / 42 …) collapse into a
 * system instead of drifting page by page.
 *
 *   loose   128 / 80   — chapter openers, the hero's neighbours
 *   base     96 / 64   — the default
 *   tight    72 / 56   — bands that sit directly against another band
 */
const RHYTHM = {
  loose: 'py-20 md:py-32',
  base: 'py-16 md:py-24',
  tight: 'py-14 md:py-[4.5rem]',
} as const;

type Rhythm = keyof typeof RHYTHM;

type SectionProps = Readonly<{
  children: ReactNode;
  /** Vertical density (default `base`). */
  rhythm?: Rhythm;
  /** Hairline rule above the section — the deck's chapter separator. */
  divided?: boolean;
  /** Full-bleed content: skips the container so the child owns its width. */
  bleed?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}>;

export function Section({
  children,
  rhythm = 'base',
  divided = false,
  bleed = false,
  id,
  className,
  ...aria
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(RHYTHM[rhythm], divided && 'border-mkt-line border-t', className)}
      {...aria}
    >
      {bleed ? children : <Container>{children}</Container>}
    </section>
  );
}

/**
 * One container and one gutter for the entire surface, so the wordmark in the
 * nav sits on the same optical line as every heading below it.
 */
export function Container({
  children,
  wide = false,
  className,
}: Readonly<{ children: ReactNode; wide?: boolean; className?: string }>) {
  return (
    <div
      className={cn(
        'px-mkt-gutter mx-auto w-full',
        wide ? 'max-w-mkt-wide' : 'max-w-mkt',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The deck's chapter opener: a numbered rail, the display heading, and a
 * standfirst that stays out of the heading's measure. Collapses to a single
 * column below `lg` rather than keeping a cramped three-column grid.
 */
export function SectionHeader({
  index,
  kicker,
  title,
  intro,
  headingId,
  as: Heading = 'h2',
}: Readonly<{
  /** Chapter number, e.g. `01`. Rendered with the kicker as `01 / NORTH STAR`. */
  index?: string;
  kicker?: string;
  title: ReactNode;
  intro?: ReactNode;
  headingId?: string;
  as?: 'h1' | 'h2' | 'h3';
}>) {
  return (
    <Reveal className="mb-14 grid items-start gap-x-8 gap-y-5 lg:mb-16 lg:grid-cols-[7.5rem_minmax(0,1fr)_20rem]">
      {(index ?? kicker) && (
        <p className="text-mkt-meta text-mkt-ink-muted mkt-num pt-2 uppercase lg:pt-3">
          {[index, kicker].filter(Boolean).join(' / ')}
        </p>
      )}
      <Heading
        id={headingId}
        className="font-mkt-display text-mkt-d2 text-mkt-ink max-w-[18ch] font-medium"
      >
        {title}
      </Heading>
      {intro && <p className="text-mkt-body text-mkt-ink-soft lg:pt-2">{intro}</p>}
    </Reveal>
  );
}
