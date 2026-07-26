import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';

import { COMPETITORS } from '@/lib/marketing-content/compare';
import { DEMO_CTA, DEMO_HREF } from '@/lib/marketing-content/nav';

import { ButtonLink } from '../primitives/button';
import { Meta } from '../primitives/label';
import { PageHero } from '../primitives/page-hero';
import { Section, SectionHeader } from '../primitives/section';
import { Reveal, StaggerGroup, StaggerItem } from '../primitives/reveal';

/**
 * `/compare` — the comparison index. Competitor cards render from the content
 * module; the "how we compare fairly" band exists because these pages make
 * claims about other people's products, and the honest-framing rule (every
 * unverified cell says so rather than guessing) has to be visible to the
 * reader, not just enforced in the data.
 */
const FAIRNESS_POINTS = [
  'Deterministic scoring — versioned rules over persisted evidence',
  'BYOK — audits run on your own provider keys',
  'Evidence-first scoring — no LLM-as-judge',
] as const;

const FACT_ROWS = [
  { key: 'Engines', value: 'ChatGPT · Gemini · Claude — one audit' },
  { key: 'Scoring', value: 'Deterministic rules, versioned projections' },
  { key: 'Evidence', value: 'Every metric drills to the raw run' },
  { key: 'Keys', value: 'BYOK · Fernet-encrypted at rest' },
  { key: 'Site health', value: 'Technical + AEO auditing built in' },
  { key: 'Deployment', value: 'Cloud or self-host with Docker Compose' },
] as const;

export function CompareIndex() {
  return (
    <>
      <PageHero
        eyebrow="Comparisons"
        title="How Searchify"
        accent="compares."
        lead="Side-by-side notes on Searchify and other AI visibility tools — what each covers, how scoring works, and where the evidence lives. Maintained by the Searchify team, marked wherever we still need to verify."
      />

      <Section rhythm="tight" aria-label="Competitors">
        <div className="border-mkt-line mb-6 flex items-center justify-between gap-4 border-b pb-4">
          <Meta as="p">Choose a tool</Meta>
          <Meta>{COMPETITORS.length} comparisons</Meta>
        </div>

        {COMPETITORS.length === 0 ? (
          <p className="border-mkt-line rounded-mkt-lg text-mkt-sm text-mkt-ink-muted border border-dashed p-10 text-center">
            Comparison research is in progress. We publish pages only after every claim is verified.
          </p>
        ) : (
          <StaggerGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {COMPETITORS.map((competitor) => (
              <StaggerItem key={competitor.slug} className="h-full">
                <Link
                  href={`/compare/${competitor.slug}`}
                  className="border-mkt-line bg-mkt-surface hover:border-mkt-line-strong hover:shadow-mkt-raised rounded-mkt-lg flex h-full flex-col border p-6 transition-[border-color,box-shadow] duration-300"
                >
                  <span className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="border-mkt-line bg-mkt-paper text-mkt-ink rounded-mkt-xs font-mkt-display text-mkt-body grid size-9 place-items-center border font-bold"
                    >
                      {competitor.name.charAt(0)}
                    </span>
                    <span className="text-mkt-body text-mkt-ink font-semibold">
                      {competitor.name}
                    </span>
                  </span>
                  <span className="text-mkt-sm text-mkt-ink-muted mt-4 block">
                    {competitor.tagline}
                  </span>
                  <span className="text-mkt-sm text-mkt-proof-text mt-auto flex items-center gap-2 pt-6 font-semibold">
                    Searchify vs {competitor.name}
                    <ArrowRight className="size-3.5" aria-hidden />
                  </span>
                </Link>
              </StaggerItem>
            ))}
          </StaggerGroup>
        )}
      </Section>

      <Section divided rhythm="loose" aria-labelledby="compare-fair-title">
        <SectionHeader
          kicker="How we compare fairly"
          title="Compared honestly, in the open."
          intro="Where a competitor fact isn’t verified first-party, the cell says so instead of guessing."
          headingId="compare-fair-title"
        />
        <Reveal className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="border-mkt-line rounded-mkt-lg bg-mkt-surface border p-8">
            <p className="text-mkt-body text-mkt-ink-soft max-w-[62ch]">
              Searchify scores deterministically — explicit analyzer and scoring-rule versions ride
              with every projection, so every claim on these pages can be traced back to persisted
              evidence.
            </p>
            <ul className="mt-6 grid gap-2.5">
              {FAIRNESS_POINTS.map((point) => (
                <li key={point} className="text-mkt-sm text-mkt-ink-soft flex gap-3">
                  <Check
                    aria-hidden
                    strokeWidth={2.5}
                    className="text-mkt-evidence-text mt-0.5 size-3.5 shrink-0"
                  />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className="border-mkt-line rounded-mkt-lg bg-mkt-paper-raised border p-8">
            <Meta as="p" className="mb-5">
              Searchify at a glance
            </Meta>
            <dl className="grid gap-0">
              {FACT_ROWS.map((row) => (
                <div
                  key={row.key}
                  className="border-mkt-line grid grid-cols-[7rem_minmax(0,1fr)] gap-4 border-b py-3 last:border-b-0 last:pb-0"
                >
                  <dt className="text-mkt-sm text-mkt-ink-muted">{row.key}</dt>
                  <dd className="text-mkt-sm text-mkt-ink m-0">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Reveal>
      </Section>

      <Section divided rhythm="loose" aria-label="Get started">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 className="font-mkt-display text-mkt-d2 text-mkt-ink mx-auto mb-5 max-w-[16ch] font-medium">
            Don’t compare pages. Compare evidence.
          </h2>
          <p className="text-mkt-lead text-mkt-ink-soft mx-auto max-w-[52ch]">
            Run the same prompts across ChatGPT, Gemini and Claude — and read the raw responses
            yourself.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            <ButtonLink href={DEMO_HREF} className="w-full sm:w-auto">
              {DEMO_CTA}
              <ArrowRight className="size-3.5" aria-hidden />
            </ButtonLink>
            <ButtonLink href="/faq" intent="secondary" className="w-full sm:w-auto">
              Read the FAQ
            </ButtonLink>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
