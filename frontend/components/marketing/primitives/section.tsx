import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

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
  tight: 'py-[calc(var(--section-y)*0.6)]',
} as const;

type Rhythm = keyof typeof RHYTHM;

/**
 * Public grounds: white paper, or the soft neutral band. Space separates
 * same-tone sections; the tone change itself is the edge between different
 * ones.
 */
const TONE = {
  paper: '',
  soft: 'bg-background-alt',
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
  /** Dense single-block sections tighten the container gap. */
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
      // Two same-tone neighbours would stack bottom + top padding into a gap
      // twice the intended rhythm. `data-citeladder-section` lets globals.css
      // collapse that seam; a tone change keeps both, because there the fill
      // edge is the boundary and needs the room.
      data-citeladder-section={tone === 'soft' ? 'soft' : 'paper'}
      className={cn(
        'relative w-full scroll-mt-[var(--marketing-nav-offset)]',
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
        dense ? 'gap-4' : 'gap-10 md:gap-14',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The section heading group: heading, then an optional lead. Every section
 * head goes through this component so heading size and lead measure cannot
 * drift page by page. There is no label above the heading; the heading
 * carries its own weight.
 */
export function SectionHeader({
  title,
  lead,
  size = 'h2',
  align = 'start',
  headingId,
  as: Heading = 'h2',
  className,
}: Readonly<{
  title: ReactNode;
  lead?: ReactNode;
  /** `h2` is the section default; `h3` is the compact rung for dense bands. */
  size?: 'h1' | 'h2' | 'h3';
  align?: 'start' | 'center';
  headingId?: string;
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
}>) {
  const center = align === 'center';
  return (
    <div
      className={cn(
        'mk-reveal flex flex-col gap-4',
        center && 'items-center text-center',
        className,
      )}
    >
      <Heading
        id={headingId}
        className={cn(
          'text-foreground text-balance',
          size === 'h3' ? 'max-w-[48ch]' : 'max-w-[32ch]',
          SECTION_HEADING_CLASSES[size],
        )}
      >
        {title}
      </Heading>
      {lead && <p className="website-lead text-muted max-w-[72ch]">{lead}</p>}
    </div>
  );
}
