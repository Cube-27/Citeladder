import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';

import { COMPETITORS, FACT_ROWS, FAIRNESS_POINTS } from '@/lib/marketing-content/compare';
import { DEMO_CTA, DEMO_HREF } from '@/lib/marketing-content/nav';

import { ButtonLink } from '../primitives/button';
import { Meta } from '../primitives/label';
import { PageHero } from '../primitives/page-hero';
import { Section, SectionHeader } from '../primitives/section';
import { Reveal, StaggerGroup, StaggerItem } from '../primitives/reveal';

/**
 * `/compare` — the comparison index. Competitor cards render from the content
 * module; the "how we compare fairly" band exists because these pages make
 * claims about other people's products, so our own sourcing discipline
 * (deterministic, evidence-first, on the reader's own keys) is stated openly
 * on the page.
 */

export function CompareIndex() {
  return (
    <>
      <PageHero
        centered
        eyebrow="Comparisons"
        title="How Searchify"
        accent="compares."
        lead="Side-by-side notes on Searchify and four other AI visibility tools — what each covers, how scoring works, and where the evidence lives. Reviewed on 2026-08-01."
      />

      <Section tone="paper" rhythm="tight" aria-label="Competitors">
        <div className="border-mkt-black-10 mb-mkt-30 gap-mkt-20 pb-mkt-20 flex items-center justify-between border-b">
          <Meta as="p">Choose a tool</Meta>
          <Meta>{COMPETITORS.length} comparisons</Meta>
        </div>

        {COMPETITORS.length === 0 ? (
          <p className="border-mkt-black-10 rounded-mkt-lg text-mkt-sm text-mkt-ink-soft p-mkt-40 border border-dashed text-center">
            Comparison notes are published as each vendor review completes.
          </p>
        ) : (
          <StaggerGroup className="gap-mkt-20 grid sm:grid-cols-2 lg:grid-cols-3">
            {COMPETITORS.map((competitor) => (
              <StaggerItem key={competitor.slug} className="h-full">
                <Link
                  href={`/compare/${competitor.slug}`}
                  className="bg-mkt-surface rounded-mkt-lg shadow-mkt-card hover:shadow-mkt-nav p-mkt-30 flex h-full flex-col transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5"
                >
                  <span className="gap-mkt-14 flex items-center">
                    <span
                      aria-hidden
                      className="border-mkt-black-10 bg-mkt-surface text-mkt-ink font-mkt-display text-mkt-body rounded-mkt-sm grid size-10 place-items-center border font-semibold"
                    >
                      {competitor.name.charAt(0)}
                    </span>
                    <span className="text-mkt-body text-mkt-ink font-semibold">
                      {competitor.name}
                    </span>
                  </span>
                  <span className="text-mkt-sm text-mkt-ink-soft mt-mkt-20 block">
                    {competitor.tagline}
                  </span>
                  <span className="text-mkt-sm text-mkt-indigo gap-mkt-10 pt-mkt-30 mt-auto flex items-center font-semibold">
                    Searchify vs {competitor.name}
                    <ArrowRight className="size-4" aria-hidden />
                  </span>
                </Link>
              </StaggerItem>
            ))}
          </StaggerGroup>
        )}
      </Section>

      <Section tone="sunken" rhythm="base" aria-labelledby="compare-fair-title">
        <SectionHeader
          eyebrow="How we compare fairly"
          title="Compared honestly, in the open."
          lead="Every competitor fact on these pages comes from the vendor's own public site, with the review date on the page."
          headingId="compare-fair-title"
        />
        <Reveal className="gap-mkt-20 grid lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-mkt-lg bg-mkt-surface shadow-mkt-card p-mkt-30">
            <p className="text-mkt-body text-mkt-ink-soft max-w-[80ch]">
              Searchify scores deterministically — explicit analyzer and scoring-rule versions ride
              with every projection, so every claim on these pages can be traced back to persisted
              evidence.
            </p>
            <ul className="mt-mkt-30 gap-mkt-14 grid">
              {FAIRNESS_POINTS.map((point) => (
                <li key={point} className="text-mkt-sm text-mkt-ink-soft gap-mkt-14 flex">
                  <Check
                    aria-hidden
                    strokeWidth={2.5}
                    className="text-mkt-success-text mt-mkt-6 size-4 shrink-0"
                  />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-mkt-lg bg-mkt-surface-sunk shadow-mkt-card p-mkt-30">
            <Meta as="p" className="mb-mkt-20">
              Searchify at a glance
            </Meta>
            <dl className="grid gap-0">
              {FACT_ROWS.map((row) => (
                <div
                  key={row.key}
                  className="border-mkt-black-10 gap-mkt-20 py-mkt-14 grid grid-cols-[7rem_minmax(0,1fr)] border-b last:border-b-0 last:pb-0"
                >
                  <dt className="text-mkt-sm text-mkt-ink-soft">{row.key}</dt>
                  <dd className="text-mkt-sm text-mkt-ink m-0">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Reveal>
      </Section>

      <Section tone="paper" rhythm="base" aria-label="Get started">
        <Reveal className="mx-auto max-w-5xl text-center">
          <h2 className="font-mkt-display text-mkt-h2 text-mkt-ink mb-mkt-20 mx-auto max-w-[32ch]">
            Don’t compare pages. Compare evidence.
          </h2>
          <p className="text-mkt-lead text-mkt-ink-soft mx-auto max-w-[80ch]">
            Run the same prompts across ChatGPT, Gemini and Claude — and read the raw responses
            yourself.
          </p>
          <div className="mt-mkt-30 gap-mkt-14 flex flex-col items-center justify-center sm:flex-row">
            <ButtonLink href={DEMO_HREF} className="w-full sm:w-auto">
              {DEMO_CTA}
              <ArrowRight aria-hidden />
            </ButtonLink>
            <ButtonLink href="/faq" variant="ghost" className="w-full sm:w-auto">
              Read the FAQ
            </ButtonLink>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
