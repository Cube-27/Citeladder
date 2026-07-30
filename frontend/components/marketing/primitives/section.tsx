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
 *   tight    80 / 48   — bands that sit directly against another band
 */
const RHYTHM = {
  loose: 'py-20 md:py-32',
  base: 'py-16 md:py-24',
  tight: 'py-12 md:py-20',
} as const;

type Rhythm = keyof typeof RHYTHM;

/**
 * Band fills. Pages read as a rhythm of alternating bands rather than one
 * long sheet; the steps are deliberately small (ΔE2000 vs paper noted per
 * tone) so a band change registers without reading as a new page. The rule
 * is NO TWO ADJACENT BANDS SHARE A TONE — and where the tone changes, the
 * fill edge is the separator, so `divided` is only kept on same-tone
 * adjacency (a hairline on a fill edge reads as a double rule).
 */
const TONE = {
  paper: '', // the .mkt-root canvas, inherited
  surface: 'bg-mkt-surface', // ΔE 3.32 vs paper
  sunken: 'bg-mkt-surface-sunk', // ΔE 3.21 vs paper
  wash: 'bg-mkt-wash', // ΔE 7.12 vs paper, the accent beat
  /* Atmosphere, not a flat fill: the soft radial field (marketing-theme.css).
     The four tones above are all within ΔE 7 of each other, which is why a
     long page of them read as one unchanging cream sheet — this is the beat
     that actually shifts the colour of a screen. */
  field: 'mkt-field relative overflow-hidden',
} as const;

type Tone = keyof typeof TONE;

type SectionProps = Readonly<{
  children: ReactNode;
  /** Vertical density (default `base`). */
  rhythm?: Rhythm;
  /** Band fill (default `paper` — the bare canvas). */
  tone?: Tone;
  /** Hairline rule above the section — only for same-tone adjacency. */
  divided?: boolean;
  /** Full-bleed content: skips the container so the child owns its width. */
  bleed?: boolean;
  /** Drop to the narrower measure — for long-form prose, not for layout. */
  narrow?: boolean;
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
  narrow = false,
  id,
  className,
  ...aria
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        TONE[tone],
        RHYTHM[rhythm],
        divided && 'border-mkt-line-soft border-t',
        className,
      )}
      {...aria}
    >
      {bleed ? (
        children
      ) : (
        <Container narrow={narrow} className={cn(tone === 'field' && 'relative z-1')}>
          {children}
        </Container>
      )}
    </section>
  );
}

/**
 * One container and one gutter for the entire surface, so the wordmark in the
 * nav sits on the same optical line as every heading below it.
 *
 * The default is the WIDE measure, and that default is the whole point: the
 * landing hero used to hard-code `max-w-mkt-wide` on its own grid while every
 * other page inherited the narrower default, so the site shipped at two
 * different widths. Making wide the default means a new section cannot forget
 * to opt in. Container width is not reading width — the text measures inside
 * (`max-w-3xl`, `max-w-[56ch]`, `max-w-[70ch]`) still cap prose, so widening
 * here only affects grids, tables and product scenes.
 */
export function Container({
  children,
  narrow = false,
  className,
}: Readonly<{ children: ReactNode; narrow?: boolean; className?: string }>) {
  return (
    <div
      className={cn(
        'px-mkt-gutter mx-auto w-full',
        narrow ? 'max-w-mkt' : 'max-w-mkt-wide',
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
 *
 * `size` exists because two bands are openers and the rest are beats: `chapter`
 * is the d2 display step, `band` drops to d4 for a section that sits tight
 * against its neighbour. Both keep the same rail and the same weight, so a
 * band still lines up with the chapters above and below it — that alignment is
 * the reason these headers are one component instead of each section rolling
 * its own heading block.
 */
export function SectionHeader({
  index,
  kicker,
  title,
  intro,
  size = 'chapter',
  headingId,
  as: Heading = 'h2',
}: Readonly<{
  /** Chapter number, e.g. `01`. Rendered with the kicker as `01 / NORTH STAR`. */
  index?: string;
  kicker?: string;
  title: ReactNode;
  intro?: ReactNode;
  size?: 'chapter' | 'band';
  headingId?: string;
  as?: 'h1' | 'h2' | 'h3';
}>) {
  return (
    <Reveal
      className={cn(
        'grid items-start gap-x-8 gap-y-5 lg:grid-cols-[7.5rem_minmax(0,1fr)_20rem]',
        size === 'chapter' ? 'mb-12 lg:mb-16' : 'mb-0',
      )}
    >
      {(index ?? kicker) && (
        <p className="text-mkt-meta text-mkt-ink-soft pt-2 font-mono uppercase tabular-nums lg:pt-3">
          {[index, kicker].filter(Boolean).join(' / ')}
        </p>
      )}
      <Heading
        id={headingId}
        className={cn(
          'font-mkt-display text-mkt-ink max-w-[32ch]',
          size === 'chapter' ? 'text-mkt-d2' : 'text-mkt-d4 max-w-[36ch]',
        )}
      >
        {title}
      </Heading>
      {intro && <p className="text-mkt-body text-mkt-ink-soft lg:pt-2">{intro}</p>}
    </Reveal>
  );
}
