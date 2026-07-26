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
 * Honest framing: the Searchify column is real copy grounded in the repo
 * docs; the competitor column stays '[TODO(user)]' — rendered as a visibly
 * marked pill — until each row is verified first-party, and the page says so
 * under the table. h2–h6 may not contain the product name (heading-query
 * convention), so the narrative slots use compliant headings.
 */
function TodoPill({ children }: Readonly<{ children: string }>) {
  return (
    <span className="border-mkt-line text-mkt-ink-muted rounded-mkt-xs text-mkt-sm inline-block border border-dashed px-2 py-1">
      {children}
    </span>
  );
}

export function CompareDetailView({ competitor }: Readonly<{ competitor: Competitor }>) {
  return (
    <>
      <header className="pt-16 pb-14 md:pt-24 md:pb-16">
        <Container>
          <Reveal className="max-w-3xl">
            <Link
              href="/compare"
              className="text-mkt-sm text-mkt-ink-muted hover:text-mkt-ink mb-8 inline-flex items-center gap-2 font-semibold transition-colors"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              All comparisons
            </Link>
            <div>
              <Eyebrow>Comparison</Eyebrow>
            </div>
            <h1 className="font-mkt-display text-mkt-d1 text-mkt-ink mt-6 mb-6 max-w-[16ch] font-medium">
              Searchify vs{' '}
              <em className="text-mkt-accent-display not-italic">{competitor.name}.</em>
            </h1>
            <p className="text-mkt-lead text-mkt-ink-soft max-w-[56ch]">
              Two ways to measure brand presence in AI answers. The Searchify column comes straight
              from our docs and source code; the {competitor.name} column stays marked until we
              verify each row.
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              <Badge>{competitor.tagline}</Badge>
              <Badge tone="warn">Last reviewed · [TODO(user): date]</Badge>
            </div>
          </Reveal>
        </Container>
      </header>

      <Section rhythm="tight" aria-label="Quick facts">
        <div className="border-mkt-line mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <Meta as="p">Quick facts</Meta>
          <Meta>Searchify column sourced from our docs</Meta>
        </div>
        <Reveal className="border-mkt-line rounded-mkt-lg bg-mkt-surface overflow-hidden border">
          {/* Wider than a phone: scrolls inside its own box so the page body
              never scrolls sideways. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] border-collapse text-left align-top">
              <thead>
                <tr className="border-mkt-line bg-mkt-paper-raised border-b">
                  <th scope="col" className="text-mkt-meta text-mkt-ink-muted p-4 uppercase">
                    Dimension
                  </th>
                  <th scope="col" className="text-mkt-meta text-mkt-proof-text p-4 uppercase">
                    Searchify
                  </th>
                  <th scope="col" className="text-mkt-meta text-mkt-ink-muted p-4 uppercase">
                    {competitor.name}
                  </th>
                </tr>
              </thead>
              <tbody>
                {competitor.rows.map((row) => (
                  <tr key={row.dimension} className="border-mkt-line border-b last:border-b-0">
                    <td className="text-mkt-sm text-mkt-ink w-52 p-4 align-top font-semibold">
                      {row.dimension}
                    </td>
                    <td className="text-mkt-sm text-mkt-ink-soft p-4 align-top">{row.searchify}</td>
                    <td className="text-mkt-sm text-mkt-ink-soft p-4 align-top">
                      {row.competitor.startsWith('[TODO') ? (
                        <TodoPill>{row.competitor}</TodoPill>
                      ) : (
                        row.competitor
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        <p className="border-mkt-amber-line bg-mkt-amber-soft text-mkt-sm text-mkt-ink-soft rounded-mkt-sm mt-4 flex gap-3 border p-4">
          <Info
            aria-hidden
            strokeWidth={1.9}
            className="text-mkt-amber-text mt-0.5 size-4 shrink-0"
          />
          <span>
            This comparison is maintained by the Searchify team. The {competitor.name} column is
            pending first-party research — verify current competitor features before quoting. Last
            reviewed [TODO(user): date].
          </span>
        </p>
      </Section>

      <Section divided aria-label="Narrative comparison">
        <div className="grid max-w-[70ch] gap-4">
          {[
            {
              tag: '[TODO(user): narrative]',
              heading: 'Where we’re different.',
              hint: '// 2–3 paragraphs: deterministic scoring, evidence drill-down, BYOK privacy. Link back to the quick-facts rows above.',
            },
            {
              tag: '[TODO(user): narrative]',
              heading: `Where ${competitor.name} may fit better.`,
              hint: '// 1–2 paragraphs, honest trade-offs only — verified capabilities, no speculation. Mark anything unverified before publishing.',
            },
            {
              tag: '[TODO(user): verdict]',
              heading: 'Our verdict.',
              hint: competitor.verdict,
            },
          ].map((block) => (
            <div
              key={block.heading}
              className="border-mkt-line rounded-mkt-lg border border-dashed p-7"
            >
              <TodoPill>{block.tag}</TodoPill>
              <h2 className="font-mkt-display text-mkt-d4 text-mkt-ink mt-4 font-medium">
                {block.heading}
              </h2>
              <p className="text-mkt-sm text-mkt-ink-muted mt-3">{block.hint}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section divided rhythm="loose" aria-label="Get started">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 className="font-mkt-display text-mkt-d2 text-mkt-ink mx-auto mb-5 max-w-[16ch] font-medium">
            See your own numbers instead.
          </h2>
          <p className="text-mkt-lead text-mkt-ink-soft mx-auto max-w-[52ch]">
            Walk through your category with us — your prompts, your competitors, the raw answers
            behind every score.
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
