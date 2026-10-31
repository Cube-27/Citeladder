import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

// The public editorial ladder resolves these semantic rungs responsively;
// embedded product previews reset to the compact app ladder.
const SECTION_HEADING_CLASSES = {
  h1: 'website-page-title',
  h2: 'website-section-heading',
  h3: 'website-feature-heading',
} as const;

/**
 * Every section is a band of the site grid (`site-grid.css`): a rule above
 * it and one cell height of padding top and bottom, on the one neutral
 * ground. `tone` survives only as the hook a control reads to step its fill
 * (`data-citeladder-section`).
 */
type Tone = 'paper' | 'soft';

type SectionProps = Readonly<{
  children: ReactNode;
  tone?: Tone;
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
  tone = 'paper',
  bleed = false,
  dense = false,
  id,
  className,
  ...aria
}: SectionProps) {
  return (
    <section
      id={id}
      data-citeladder-section={tone}
      className={cn('site-band relative w-full scroll-mt-[var(--marketing-nav-offset)]', className)}
      {...aria}
    >
      {bleed ? children : <Container dense={dense}>{children}</Container>}
    </section>
  );
}

/**
 * Shared public content measure. Inside the site grid `.site-wrap` insets
 * the content one cell from the frame line; outside it (the footer) the
 * plain gutters apply.
 */
export function Container({
  children,
  dense = false,
  className,
}: Readonly<{ children: ReactNode; dense?: boolean; className?: string }>) {
  return (
    <div
      className={cn(
        'site-wrap relative z-1 mx-auto flex w-full max-w-7xl min-w-0 flex-col px-[var(--site-gutter)]',
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
      {lead && <p className="website-lead max-w-[72ch]">{lead}</p>}
    </div>
  );
}
