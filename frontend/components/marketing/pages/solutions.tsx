import {
  ArrowRight,
  Briefcase,
  Building2,
  Check,
  Megaphone,
  Rocket,
  ShoppingBag,
} from 'lucide-react';

import { DEMO_CTA, DEMO_HREF } from '@/lib/marketing-content/nav';
import { SOLUTION_SEGMENTS, SOLUTIONS_HERO } from '@/lib/marketing-content/solutions';
import { cn } from '@/lib/utils';

import { ButtonLink, TextLink } from '../primitives/button';
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

export function SolutionsHero() {
  return (
    <PageHero
      centered
      eyebrow={SOLUTIONS_HERO.eyebrow}
      title={SOLUTIONS_HERO.title}
      accent={SOLUTIONS_HERO.accent}
      lead={SOLUTIONS_HERO.lead}
    >
      <nav
        aria-label="Solutions by team"
        className="mt-mkt-30 gap-mkt-14 flex flex-wrap justify-center"
      >
        {SOLUTION_SEGMENTS.map(({ id, label }) => {
          const Icon = SEGMENT_ICONS[id as keyof typeof SEGMENT_ICONS];
          return (
            <a
              key={id}
              href={`#${id}`}
              className="border-mkt-black-10 bg-mkt-surface text-mkt-ink hover:border-mkt-mist rounded-mkt-sm text-mkt-sm gap-mkt-14 px-mkt-20 py-mkt-14 inline-flex items-center border font-semibold transition-colors duration-200"
            >
              <Icon aria-hidden strokeWidth={1.8} className="text-mkt-ink-soft size-4" />
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
      {SOLUTION_SEGMENTS.map((segment, index) => (
        <Section
          key={segment.id}
          id={segment.id}
          tone={index % 2 ? 'sunken' : 'paper'}
          rhythm="base"
          aria-label={segment.label}
        >
          <Reveal
            className={cn(
              'gap-mkt-40 lg:gap-mkt-70 grid items-center lg:grid-cols-2',
              // Alternating sides stop five consecutive segments from reading
              // as one long list.
              index % 2 === 1 && '[&>*:first-child]:lg:order-2',
            )}
          >
            <div>
              <Meta as="p">{segment.eyebrow}</Meta>
              <h2 className="font-mkt-display text-mkt-h3 text-mkt-ink mt-mkt-20 max-w-[32ch]">
                {segment.title}
              </h2>

              <Meta as="p" className="mt-mkt-30 mb-mkt-14">
                The pain
              </Meta>
              <ul className="gap-mkt-14 grid">
                {segment.pains.map((pain) => (
                  <li key={pain} className="text-mkt-sm text-mkt-ink-soft gap-mkt-14 flex">
                    <span aria-hidden className="text-mkt-mist">
                      —
                    </span>
                    {pain}
                  </li>
                ))}
              </ul>

              <Meta as="p" className="mt-mkt-30 mb-mkt-14">
                How Searchify maps
              </Meta>
              <ul className="gap-mkt-14 grid">
                {segment.mappings.map((mapping) => (
                  <li key={mapping} className="text-mkt-sm text-mkt-ink-soft gap-mkt-14 flex">
                    <Check
                      aria-hidden
                      strokeWidth={2.5}
                      className="text-mkt-success-text mt-mkt-6 size-4 shrink-0"
                    />
                    {mapping}
                  </li>
                ))}
              </ul>

              <div className="mt-mkt-30">
                <TextLink href={DEMO_HREF}>
                  {segment.cta}
                  <ArrowRight aria-hidden />
                </TextLink>
              </div>
            </div>

            <SolutionEvidencePanel scene={segment.scene} />
          </Reveal>
        </Section>
      ))}
    </>
  );
}

export function SolutionsCta() {
  return (
    <Section tone="paper" rhythm="base" aria-label="Get started">
      <Reveal className="mx-auto max-w-5xl text-center">
        <h2 className="font-mkt-display text-mkt-h2 text-mkt-ink mb-mkt-20 mx-auto max-w-[32ch]">
          Bring your team the version of the truth it reports in.
        </h2>
        <p className="text-mkt-lead text-mkt-ink-soft mx-auto max-w-[80ch]">
          One observation field, five ways of reading it. We will walk through the one that matches
          how you are measured.
        </p>
        <div className="mt-mkt-30 gap-mkt-14 flex flex-col items-center justify-center sm:flex-row">
          <ButtonLink href={DEMO_HREF} className="w-full sm:w-auto">
            {DEMO_CTA}
            <ArrowRight aria-hidden />
          </ButtonLink>
          <ButtonLink href="/pricing" variant="ghost" className="w-full sm:w-auto">
            See pricing
          </ButtonLink>
        </div>
      </Reveal>
    </Section>
  );
}
