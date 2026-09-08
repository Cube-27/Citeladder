import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import type { Competitor } from '@/lib/marketing-content/compare';
import { PARENT_COMPANY } from '@/lib/marketing-content/legal';
import { DEMO_CTA } from '@/lib/marketing-content/nav';
import { cn } from '@/lib/utils';

import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { Eyebrow } from '../primitives/label';
import { Container, Section } from '../primitives/section';
import { Reveal } from '../primitives/reveal';

/**
 * `/compare/[competitor]` — compact header straight into the table. Editorial
 * blocks stay honest (verdict + better-fit) but short. h2–h6 must not contain
 * the product name; the better-fit heading uses the competitor's name only.
 */

export function CompareDetailView({ competitor }: Readonly<{ competitor: Competitor }>) {
  return (
    <>
      <header className="border-border-subtle border-b pt-16 pb-6 md:pb-8">
        <Container dense>
          <Reveal className="max-w-5xl">
            <Link
              href="/compare"
              className="text-muted hover:text-foreground mb-5 flex w-fit items-center gap-2 text-sm font-medium transition-colors"
            >
              <ArrowLeft className="size-4" aria-hidden />
              All comparisons
            </Link>
            <Eyebrow>Comparison · {competitor.lastReviewed}</Eyebrow>
            <h1 className="website-page-title text-foreground mt-4 max-w-[28ch] text-balance">
              CiteLadder vs <em className="text-accent-text not-italic">{competitor.name}</em>
            </h1>
            <p className="website-body-lg text-muted mt-3 max-w-[56ch]">{competitor.lead}</p>
            <p className="website-body text-muted mt-2 max-w-[56ch]">{competitor.tagline}</p>
          </Reveal>
        </Container>
      </header>

      <Section tone="paper" rhythm="tight" aria-label="Quick facts" dense>
        <Reveal className="border-border-subtle bg-panel overflow-hidden rounded-[var(--radius-card)] border">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left">
              <thead>
                <tr className="border-border-subtle bg-background-alt border-b">
                  <th
                    scope="col"
                    className="text-muted bg-background-alt text-support sticky left-0 z-1 px-4 py-3 font-medium"
                  >
                    Dimension
                  </th>
                  <th scope="col" className="text-accent-text text-support px-4 py-3 font-medium">
                    CiteLadder
                  </th>
                  <th scope="col" className="text-muted text-support px-4 py-3 font-medium">
                    {competitor.name}
                  </th>
                </tr>
              </thead>
              <tbody>
                {competitor.rows.map((row, index) => (
                  <tr
                    key={row.dimension}
                    className={cn(
                      'border-border-subtle border-b last:border-b-0',
                      index % 2 === 1 && 'bg-background-alt/60',
                    )}
                  >
                    <th
                      scope="row"
                      className={cn(
                        'text-foreground z-1 w-36 sticky left-0 px-4 py-2.5 align-top text-sm font-medium',
                        index % 2 === 1 ? 'bg-background-alt' : 'bg-panel',
                      )}
                    >
                      {row.dimension}
                    </th>
                    <td className="text-foreground px-4 py-2.5 align-top text-sm leading-snug">
                      {row.citeladder}
                    </td>
                    <td className="text-muted px-4 py-2.5 align-top text-sm leading-snug">
                      {row.competitor}
                      <span className="text-subtle mt-1 block text-xs">
                        Sources:{' '}
                        {competitor.sources
                          .filter((source) => source.dimensions.includes(row.dimension))
                          .map((source, sourceIndex) => (
                            <span key={source.url}>
                              {sourceIndex > 0 ? ' · ' : ''}
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-accent-text hover:text-foreground underline"
                              >
                                {source.label}
                              </a>
                            </span>
                          ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
        <div className="website-label text-subtle mt-3 space-y-1">
          <p>
            Publisher-authored and maintained by{' '}
            <a
              href={PARENT_COMPANY.href}
              target="_blank"
              rel="noreferrer"
              className="text-accent-text hover:text-foreground underline"
            >
              the CiteLadder team
            </a>
            .{' '}
            <time dateTime={competitor.lastReviewed}>Last reviewed {competitor.lastReviewed}</time>.
          </p>
          <p>
            Comparison criteria: published product capabilities, pricing, evidence access, and
            measurement method. Source links appear beside the dimensions they support:{' '}
            {competitor.sources.map((source, index) => (
              <span key={source.url}>
                {index > 0 ? ' · ' : ''}
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-text hover:text-foreground underline"
                >
                  {source.label} ({source.dimensions.join(', ')})
                </a>
              </span>
            ))}
            . Re-check before quoting.
          </p>
        </div>
      </Section>

      <Section tone="sunken" rhythm="tight" aria-label="Verdict and fit">
        <Reveal className="grid gap-8 md:grid-cols-2 md:gap-10">
          <div>
            <h2 className="website-feature-heading text-foreground">Our verdict</h2>
            <p className="website-body text-muted mt-3">{competitor.verdict}</p>
          </div>
          <div>
            <h2 className="website-feature-heading text-foreground">
              Where {competitor.name} fits better
            </h2>
            <p className="website-body text-muted mt-3">{competitor.betterFit}</p>
          </div>
        </Reveal>
      </Section>

      <Section tone="teal" rhythm="base" aria-label="Get started">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 className="website-section-heading origin-centre text-foreground mx-auto mb-3 max-w-[28ch]">
            See your own numbers instead.
          </h2>
          <p className="website-body-lg text-muted mx-auto max-w-[52ch]">
            Your category, your prompts, raw answers behind every score.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <DemoButtonLink className="w-full sm:w-auto">
              {DEMO_CTA}
              <ArrowRight aria-hidden />
            </DemoButtonLink>
            <ButtonLink href="/faq" variant="ghost" className="w-full sm:w-auto">
              Read the FAQ
            </ButtonLink>
          </div>
        </Reveal>
      </Section>
    </>
  );
}
