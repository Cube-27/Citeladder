import { ArrowRight, Briefcase, Building2, Megaphone, Rocket, ShoppingBag } from 'lucide-react';

import { DEMO_CTA } from '@/lib/marketing-content/nav';
import { SOLUTION_SEGMENTS, SOLUTIONS_HERO } from '@/lib/marketing-content/solutions';
import { cn } from '@/lib/utils';

import { ButtonLink, DemoButtonLink, DemoTextLink } from '../primitives/button';
import { Meta } from '../primitives/label';
import { PageHero } from '../primitives/page-hero';
import { Section } from '../primitives/section';
import { Reveal } from '../primitives/reveal';
import { SolutionEvidencePanel } from '../scenes/evidence-panel';

/**
 * `/solutions` — five audience segments, each alternating copy and an
 * evidence panel. The section ids (`agencies`, `in-house`, `founders`,
 * `commerce`, `pr`) are the targets of the nav's Solutions dropdown and the
 * footer, so they are part of the route's contract.
 */
const SEGMENT_ICONS = {
  agencies: Briefcase,
  'in-house': Building2,
  founders: Rocket,
  commerce: ShoppingBag,
  pr: Megaphone,
} as const;

/**
 * Product hues, one per segment (the reference system's four-hue set; `pr`
 * bookends the page with `agencies`' blue). The hue rides the segment's
 * eyebrow dot, check marks, hero chip icon, and the evidence panel's soft
 * wallpaper fill — deep rungs for ink on the soft tile fill, matching the
 * tile tokens in globals.css.
 */
type HueKey = 'blue' | 'indigo' | 'purple' | 'green';

// `satisfies` (not a bare annotation) so the map stays exhaustive over the ids
// actually shipped: adding a segment without a hue is a compile error rather
// than an undefined class name at the two lookup sites below.
const SEGMENT_HUES = {
  agencies: 'blue',
  'in-house': 'indigo',
  founders: 'green',
  commerce: 'purple',
  pr: 'blue',
} satisfies Record<(typeof SOLUTION_SEGMENTS)[number]['id'], HueKey>;

/** Total lookup: an id outside the map falls back to the page's opening hue. */
const hueFor = (id: string): HueKey => (SEGMENT_HUES as Record<string, HueKey>)[id] ?? 'blue';

const HUE_DOT: Record<HueKey, string> = {
  blue: 'bg-tile-blue-ink',
  indigo: 'bg-tile-indigo-ink',
  purple: 'bg-tile-purple-ink',
  green: 'bg-tile-green-ink',
};

const HUE_ICON: Record<HueKey, string> = {
  blue: 'text-tile-blue-ink',
  indigo: 'text-tile-indigo-ink',
  purple: 'text-tile-purple-ink',
  green: 'text-tile-green-ink',
};

export function SolutionsHero() {
  return (
    <PageHero
      eyebrow={SOLUTIONS_HERO.eyebrow}
      title={SOLUTIONS_HERO.title}
      accent={SOLUTIONS_HERO.accent}
      lead={SOLUTIONS_HERO.lead}
      centered
    >
      <nav aria-label="Solutions by team" className="mt-8 flex flex-wrap justify-center gap-4">
        {SOLUTION_SEGMENTS.map(({ id, label }) => {
          const Icon = SEGMENT_ICONS[id as keyof typeof SEGMENT_ICONS];
          return (
            <a
              key={id}
              href={`#${id}`}
              className="border-border-subtle bg-panel text-foreground hover:bg-accent-soft inline-flex items-center gap-4 rounded-[var(--radius-card)] border px-5 py-4 text-sm font-medium transition-colors duration-200"
            >
              <Icon aria-hidden className={cn('size-4', HUE_ICON[hueFor(id)])} />
              {label}
            </a>
          );
        })}
      </nav>
    </PageHero>
  );
}

export function SolutionSegments() {
  return (
    <>
      {SOLUTION_SEGMENTS.map((segment, index) => {
        const hue = hueFor(segment.id);
        return (
          <Section
            key={segment.id}
            id={segment.id}
            tone={index % 2 ? 'sunken' : 'paper'}
            rhythm="base"
            aria-label={segment.label}
          >
            {/* The product surface is the section's content and always owns the
                3fr track; the copy column stays at 2fr. Odd rows flip the
                tracks and place explicitly — reordering children would let the
                panel fall into the narrow track. */}
            <Reveal
              className={cn(
                'grid items-center gap-10 lg:gap-16',
                index % 2 === 1 ? 'lg:grid-cols-[3fr_2fr]' : 'lg:grid-cols-[2fr_3fr]',
              )}
            >
              <div className={cn(index % 2 === 1 && 'lg:col-start-2 lg:row-start-1')}>
                <Meta as="p" className="flex items-center gap-2">
                  <span aria-hidden className={cn('size-2 shrink-0 rounded-full', HUE_DOT[hue])} />
                  {segment.eyebrow}
                </Meta>
                <h2 className="website-section-heading text-foreground mt-5 max-w-[28ch]">
                  {segment.title}
                </h2>
                <p className="website-body-lg text-muted mt-5 max-w-[42ch]">{segment.lead}</p>
                <div className="mt-8">
                  <DemoTextLink>
                    {segment.cta}
                    <ArrowRight aria-hidden />
                  </DemoTextLink>
                </div>
              </div>

              <SolutionEvidencePanel
                scene={segment.scene}
                tint={hue}
                className={cn(index % 2 === 1 && 'lg:col-start-1 lg:row-start-1')}
              />
            </Reveal>
          </Section>
        );
      })}
    </>
  );
}

export function SolutionsCta() {
  return (
    <Section tone="teal" rhythm="base" aria-label="Get started">
      <Reveal className="mx-auto max-w-5xl text-center">
        <h2 className="website-section-heading origin-centre text-foreground mx-auto mb-5 max-w-[32ch]">
          Bring your team the version of the truth it reports in.
        </h2>
        <p className="website-lead text-muted mx-auto max-w-[75ch]">
          One observation field, five ways of reading it. We will walk through the one that matches
          how you are measured.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <DemoButtonLink className="w-full sm:w-auto">
            {DEMO_CTA}
            <ArrowRight aria-hidden />
          </DemoButtonLink>
          <ButtonLink href="/pricing" variant="ghost" className="w-full sm:w-auto">
            See pricing
          </ButtonLink>
        </div>
      </Reveal>
    </Section>
  );
}
