import { ArrowLeft, ArrowRight, Info } from 'lucide-react';
import Link from 'next/link';

import type { Competitor } from '@/lib/marketing-content/compare';
import { DEMO_CTA, DEMO_HREF } from '@/lib/marketing-content/nav';

import { Badge } from '../primitives/badge';
import { ButtonLink } from '../primitives/button';
import { Eyebrow, Meta } from '../primitives/label';
import { Container, Section } from '../primitives/section';
import { Reveal } from '../primitives/reveal';

/**
 * `/compare/[competitor]` view. The route's default export is a thin async
 * wrapper (Next 16 `params` is a Promise); it resolves the slug and hands the
 * content-module entry here, so this view stays sync and tests render it
 * directly.
 *
 * Every row ships with both cells written (see the module's sourcing rule);
 * the editorial blocks are the verdict and an honest "where {name} fits
 * better". h2–h6 may not contain the product name (heading-query
 * convention) — the better-fit heading below uses the competitor's name, not
 * ours.
 */

export function CompareDetailView({ competitor }: Readonly<{ competitor: Competitor }>) {
  return (
    <>
      <header className="pt-mkt-70 pb-mkt-50 md:pt-mkt-100 md:pb-mkt-70">
        <Container>
          <Reveal className="max-w-5xl">
            <Link
              href="/compare"
              className="text-mkt-sm text-mkt-ink-soft hover:text-mkt-ink mb-mkt-30 gap-mkt-10 inline-flex items-center font-semibold transition-colors"
            >
              <ArrowLeft className="size-4" aria-hidden />
              All comparisons
            </Link>
            <div>
              <Eyebrow>Comparison</Eyebrow>
            </div>
            <h1 className="font-mkt-display text-mkt-h1 text-mkt-ink mt-mkt-30 mb-mkt-30 max-w-[32ch]">
              Searchify vs <em className="mkt-keyword not-italic">{competitor.name}.</em>
            </h1>
            <p className="text-mkt-lead text-mkt-ink-soft max-w-[80ch]">
              Two ways to measure brand presence in AI answers — engine coverage, how scoring works,
              and where the evidence lives.
            </p>
            <div className="mt-mkt-30 gap-mkt-14 flex flex-wrap">
              <Badge>{competitor.tagline}</Badge>
              <Badge>Last reviewed · {competitor.lastReviewed}</Badge>
            </div>
          </Reveal>
        </Container>
      </header>

      <Section tone="paper" rhythm="tight" aria-label="Quick facts">
        <div className="border-mkt-black-10 mb-mkt-30 gap-mkt-14 pb-mkt-20 flex flex-wrap items-center justify-between border-b">
          <Meta as="p">Quick facts</Meta>
          <Meta>Searchify column sourced from our source code</Meta>
        </div>
        <Reveal className="rounded-mkt-lg bg-mkt-surface shadow-mkt-card overflow-hidden">
          {/* Wider than a phone: scrolls inside its own box so the page body
              never scrolls sideways. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-left align-top">
              <thead>
                <tr className="border-mkt-black-10 bg-mkt-surface-sunk border-b">
                  <th scope="col" className="text-mkt-xs text-mkt-ink-soft p-mkt-20 uppercase">
                    Dimension
                  </th>
                  <th scope="col" className="text-mkt-xs text-mkt-indigo p-mkt-20 uppercase">
                    Searchify
                  </th>
                  <th scope="col" className="text-mkt-xs text-mkt-ink-soft p-mkt-20 uppercase">
                    {competitor.name}
                  </th>
                </tr>
              </thead>
              <tbody>
                {competitor.rows.map((row) => (
                  <tr key={row.dimension} className="border-mkt-black-10 border-b last:border-b-0">
                    <td className="text-mkt-sm text-mkt-ink p-mkt-20 w-52 align-top font-semibold">
                      {row.dimension}
                    </td>
                    <td className="text-mkt-sm text-mkt-ink-soft p-mkt-20 align-top">
                      {row.searchify}
                    </td>
                    <td className="text-mkt-sm text-mkt-ink-soft p-mkt-20 align-top">
                      {row.competitor}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        <p className="border-mkt-warning bg-mkt-warning/10 text-mkt-sm text-mkt-ink-soft rounded-mkt-sm mt-mkt-20 gap-mkt-14 p-mkt-20 flex border">
          <Info
            aria-hidden
            strokeWidth={1.9}
            className="text-mkt-warning-text mt-mkt-6 size-4 shrink-0"
          />
          <span>
            Maintained by the Searchify team from each vendor’s public pages. Last reviewed{' '}
            {competitor.lastReviewed}. Vendor capabilities change — re-check before quoting.
          </span>
        </p>
      </Section>

      <Section tone="paper" aria-label="Verdict and fit">
        <Reveal className="gap-mkt-20 grid lg:grid-cols-2">
          <div className="rounded-mkt-lg bg-mkt-surface shadow-mkt-card p-mkt-30">
            <h2 className="font-mkt-display text-mkt-h4 text-mkt-ink">Our verdict.</h2>
            <p className="text-mkt-body text-mkt-ink-soft mt-mkt-20">{competitor.verdict}</p>
          </div>
          <div className="rounded-mkt-lg bg-mkt-surface-sunk shadow-mkt-card p-mkt-30">
            <h2 className="font-mkt-display text-mkt-h4 text-mkt-ink">
              Where {competitor.name} fits better.
            </h2>
            <p className="text-mkt-body text-mkt-ink-soft mt-mkt-20">{competitor.betterFit}</p>
          </div>
        </Reveal>
      </Section>

      <Section tone="paper" rhythm="base" aria-label="Get started">
        <Reveal className="mx-auto max-w-5xl text-center">
          <h2 className="font-mkt-display text-mkt-h2 text-mkt-ink mb-mkt-20 mx-auto max-w-[32ch]">
            See your own numbers instead.
          </h2>
          <p className="text-mkt-lead text-mkt-ink-soft mx-auto max-w-[80ch]">
            Walk through your category with us — your prompts, your competitors, the raw answers
            behind every score.
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
