import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Eyebrow } from './label';
import { Reveal } from './reveal';

/**
 * Vertical rhythm for the whole public surface. Sections NEVER set their own
 * padding — the six cases live here, so every page breathes identically
 * (docs/website-design-system.md §3).
 *
 * The ladder is 100 desktop / 70 tablet / 50 mobile (`base`), and `hero` runs
 * one step above it at 120 / 100 / 70 so the opening band clears the fixed nav
 * strip. `tight` is the step below base (70 / 50 / 40); `open` and `close` are
 * the two halves of a run of sections that reads as one block; `none` is the
 * marquee case, which carries its own gap instead of padding.
 */
const RHYTHM = {
  hero: 'pt-mkt-70 pb-mkt-70 md:pt-mkt-100 md:pb-mkt-100 xl:pt-mkt-120 xl:pb-mkt-120',
  base: 'py-mkt-50 md:py-mkt-70 xl:py-mkt-100',
  open: 'pt-mkt-50 md:pt-mkt-70 xl:pt-mkt-100',
  close: 'pb-mkt-50 md:pb-mkt-70 xl:pb-mkt-100',
  tight: 'py-mkt-40 md:py-mkt-50 xl:py-mkt-70',
  none: '',
} as const;

type Rhythm = keyof typeof RHYTHM;

/**
 * Band fills. Pages read as a rhythm of alternating bands rather than one long
 * sheet, and the rule is NO TWO ADJACENT BANDS SHARE A TONE. Only two fills
 * exist by design: white and the Light Gray Blue separator. A section
 * background is never a new hue, and never the accent gradient (§1).
 */
const TONE = {
  paper: '',
  sunken: 'bg-mkt-surface-sunk',
} as const;

type Tone = keyof typeof TONE;

type SectionProps = Readonly<{
  children: ReactNode;
  rhythm?: Rhythm;
  tone?: Tone;
  /** Hairline rule above the section — only for same-tone adjacency. */
  divided?: boolean;
  /** Full-bleed: skips the container so the child owns its width. */
  bleed?: boolean;
  /** Dense single-block sections drop the 50px container gap to 10px. */
  dense?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}>;

export function Section({
  children,
  rhythm = 'base',
  tone = 'paper',
  divided = false,
  bleed = false,
  dense = false,
  id,
  className,
  ...aria
}: SectionProps) {
  return (
    <section
      id={id}
      // Two same-tone neighbours stack bottom + top padding and open a gap
      // twice the intended rhythm, which reads as a hole in the page rather
      // than a section break. `data-mkt-section` lets the stylesheet collapse
      // the seam (marketing-scenes.css); a tone change keeps the full pair,
      // because there the fill edge is the boundary and needs the room.
      data-mkt-section={tone}
      className={cn(
        'relative w-full',
        TONE[tone],
        RHYTHM[rhythm],
        divided && 'border-mkt-black-10 border-t',
        className,
      )}
      {...aria}
    >
      {bleed ? children : <Container dense={dense}>{children}</Container>}
    </section>
  );
}

/**
 * The container is non-negotiable: 1260px max-width, centered, 30/24/20px
 * gutter, and a 50/40/30px gap between its children. Sections stay full-bleed
 * so backgrounds and decorative elements can run edge to edge, and every piece
 * of content sits in here.
 */
export function Container({
  children,
  dense = false,
  className,
}: Readonly<{ children: ReactNode; dense?: boolean; className?: string }>) {
  return (
    <div
      className={cn(
        'max-w-mkt px-mkt-gutter-phone md:px-mkt-gutter-tablet xl:px-mkt-gutter relative z-1 mx-auto flex w-full flex-col',
        dense ? 'gap-mkt-10' : 'gap-mkt-30 md:gap-mkt-40 xl:gap-mkt-50',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The section heading group: eyebrow → heading → lead, at the 10–20px internal
 * gap the spec sets for a heading group (§3). Every section head goes through
 * this component — that is what keeps eyebrow distance and heading size from
 * drifting page by page.
 *
 * Entrance delays follow the spec's 0.1s sequence (eyebrow/heading 0.1s, lead
 * 0.2s), applied by `Reveal` on the group rather than per element.
 */
export function SectionHeader({
  eyebrow,
  title,
  lead,
  size = 'h2',
  align = 'start',
  headingId,
  as: Heading = 'h2',
  className,
}: Readonly<{
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  /** `h2` is the section default; `h3` is the compact rung for dense bands. */
  size?: 'h1' | 'h2' | 'h3';
  align?: 'start' | 'center';
  headingId?: string;
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
}>) {
  const HEADING = {
    h1: 'text-mkt-h1',
    h2: 'text-mkt-h2',
    h3: 'text-mkt-h3',
  } as const;

  return (
    <Reveal
      className={cn(
        'gap-mkt-14 flex flex-col',
        align === 'center' && 'items-center text-center',
        className,
      )}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <Heading
        id={headingId}
        className={cn('font-mkt-display text-mkt-ink max-w-[32ch] text-balance', HEADING[size])}
      >
        {title}
      </Heading>
      {lead && <p className="text-mkt-lead text-mkt-ink-soft max-w-[65ch]">{lead}</p>}
    </Reveal>
  );
}
