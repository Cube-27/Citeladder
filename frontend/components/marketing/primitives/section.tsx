import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { Eyebrow } from './label';
import { Reveal } from './reveal';

// The public editorial ladder resolves these semantic rungs responsively;
// embedded product previews reset to the compact app ladder.
const SECTION_HEADING_CLASSES = {
  h1: 'website-page-title',
  h2: 'website-section-heading',
  h3: 'website-feature-heading',
} as const;

/** Shared public section rhythm resolves through the central responsive token. */
const RHYTHM = {
  base: 'py-[var(--section-y)]',
  tight: 'py-[calc(var(--section-y)*0.65)]',
} as const;

type Rhythm = keyof typeof RHYTHM;

/** Public section tones use the existing semantic canvas owners. */
const TONE = {
  paper: '',
  sunken: 'bg-canvas-soft',
  indigo: 'bg-band-indigo',
  teal: 'bg-band-teal',
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
      // than a section break. `data-citeladder-section` lets globals.css collapse
      // the seam; a tone change keeps the full pair, because there the fill edge
      // is the boundary and needs the room.
      data-citeladder-section={tone}
      className={cn(
        'band-grain relative w-full',
        TONE[tone],
        RHYTHM[rhythm],
        divided && 'border-border-subtle border-t',
        className,
      )}
      {...aria}
    >
      {bleed ? children : <Container dense={dense}>{children}</Container>}
    </section>
  );
}

/** Shared public content measure and responsive gutters. */
export function Container({
  children,
  dense = false,
  className,
}: Readonly<{ children: ReactNode; dense?: boolean; className?: string }>) {
  return (
    <div
      className={cn(
        'relative z-1 mx-auto flex w-full max-w-7xl min-w-0 flex-col px-[var(--site-gutter)]',
        dense ? 'gap-3' : 'gap-6 md:gap-8',
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
  headingId,
  as: Heading = 'h2',
  className,
}: Readonly<{
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  /** `h2` is the section default; `h3` is the compact rung for dense bands. */
  size?: 'h1' | 'h2' | 'h3';
  headingId?: string;
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
}>) {
  return (
    <Reveal className={cn('flex flex-col gap-3', className)}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <Heading
        id={headingId}
        className={cn('text-foreground max-w-[48ch] text-balance', SECTION_HEADING_CLASSES[size])}
      >
        {title}
      </Heading>
      {lead && <p className="website-lead text-muted max-w-[65ch]">{lead}</p>}
    </Reveal>
  );
}
