import { ArrowRight, ChevronDown, FileText, MessageSquare } from 'lucide-react';

import type { CommercialPage } from '@/lib/marketing-content/commercial-pages';
import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { PageHero } from '../primitives/page-hero';
import { Section, SectionHeader } from '../primitives/section';

export function CommercialEntryPage({ page }: Readonly<{ page: CommercialPage }>) {
  return (
    <>
      <PageHero eyebrow={page.eyebrow} title={page.heading} lead={page.introduction} centered>
        <div className="mt-8 flex flex-wrap justify-center gap-4" data-cta-placement="hero">
          <DemoButtonLink />
          <ButtonLink href={page.secondary.href} variant="soft">
            {page.secondary.label}
          </ButtonLink>
        </div>
        <CommercialEvidence kind={page.kind} />
      </PageHero>
      <Section>
        <SectionHeader title={page.overview.heading} lead={page.overview.lead} />
        <div className="grid gap-8 md:grid-cols-2 md:gap-16">
          {page.definitions.map((definition) => (
            <div key={definition.heading} className="space-y-3">
              <h3 className="website-feature-heading text-foreground">{definition.heading}</h3>
              <p className="website-body-lg text-secondary max-w-[65ch]">{definition.body}</p>
            </div>
          ))}
        </div>
      </Section>
      <Section tone="sunken">
        <div className="grid items-start gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
          <SectionHeader title={page.workflow.heading} lead={page.workflow.lead} />
          <ol className="divide-border-subtle divide-y">
            {page.workflow.steps.map((step, index) => (
              <li key={step.heading} className="flex gap-5 py-6 first:pt-0 last:pb-0">
                <span className="website-label text-muted pt-1 tabular-nums" aria-hidden>
                  {index + 1}
                </span>
                <div className="space-y-3">
                  <h3 className="website-feature-heading text-foreground">{step.heading}</h3>
                  <p className="website-body-lg text-secondary">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Section>
      <Section>
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-20">
          <SectionHeader title={page.contextHeading} lead={page.context} />
          <ul className="divide-border-subtle divide-y" aria-label="Related pages">
            {page.related.map((link) => (
              <li key={link.href}>
                <a
                  className="website-body-lg text-accent-text hover:text-accent-hover flex items-center justify-between gap-5 py-4 transition-colors"
                  href={link.href}
                >
                  <span>{link.label}</span>
                  <ArrowRight className="size-4 shrink-0" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </Section>
      <Section tone="sunken">
        <div className="grid items-start gap-10 lg:grid-cols-[0.65fr_1.35fr] lg:gap-20">
          <SectionHeader
            title="Frequently asked questions"
            lead="What the observations mean, and where their limits are."
          />
          <div>
            {page.faqs.map((faq) => (
              <details key={faq.q} className="group border-border-subtle border-b py-5 first:pt-0">
                <summary className="website-feature-heading text-foreground flex cursor-pointer list-none items-start justify-between gap-5 [&::-webkit-details-marker]:hidden">
                  <span>{faq.q}</span>
                  <ChevronDown
                    className="mt-1 size-4 shrink-0 transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <p className="website-body-lg text-muted mt-4">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </Section>
      <Section className="marketing-closing-band" aria-label="Get started">
        <div
          className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center"
          data-cta-placement="closing"
        >
          <SectionHeader title={page.closingHeading} lead={page.closing} />
          <DemoButtonLink />
        </div>
      </Section>
    </>
  );
}

/** Static teaching examples, deliberately separate from product previews and live metrics. */
function CommercialEvidence({ kind }: Readonly<{ kind: CommercialPage['kind'] }>) {
  return (
    <figure className="bg-panel border-border mt-12 overflow-hidden rounded-[var(--radius-card)] border text-left">
      <div className="website-label text-muted border-border-subtle flex flex-wrap justify-between gap-3 border-b px-6 py-4">
        <span>
          {kind === 'citation'
            ? 'From buyer question to cited source'
            : 'Read the denominator before the percentage'}
        </span>
        <span>Illustrative example</span>
      </div>
      {kind === 'citation' ? (
        <div className="grid md:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5 p-6 md:p-8">
            <p className="website-label text-muted flex items-center gap-3">
              <MessageSquare className="size-4" aria-hidden /> Buyer question
            </p>
            <p className="website-feature-heading text-foreground">
              Which scheduling tools work across several clinic locations?
            </p>
            <div className="bg-well space-y-3 rounded-[var(--radius-card)] p-5">
              <p className="website-label text-muted">Answer observation</p>
              <p className="website-body-lg text-secondary">
                The answer names your product but cites an independent comparison.
              </p>
            </div>
          </div>
          <dl className="bg-canvas-soft space-y-6 p-6 md:p-8">
            <div className="space-y-2">
              <dt className="website-label text-muted">Brand mentioned</dt>
              <dd className="website-feature-heading text-foreground">Your product</dd>
            </div>
            <div className="space-y-2">
              <dt className="website-label text-muted flex items-center gap-3">
                <FileText className="size-4" aria-hidden /> Source cited
              </dt>
              <dd className="website-feature-heading text-foreground">An independent comparison</dd>
            </div>
            <div className="space-y-2">
              <dt className="website-label text-muted">Next question</dt>
              <dd className="website-body text-secondary">
                Does that comparison describe your current features accurately?
              </dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="grid md:grid-cols-2">
          <div className="p-6 md:p-8">
            <table className="website-body w-full text-left">
              <caption className="website-feature-heading text-foreground mb-5 text-left">
                100 completed answers
              </caption>
              <thead className="website-label text-muted border-border-subtle border-b">
                <tr>
                  <th scope="col" className="pb-3">
                    Observation
                  </th>
                  <th scope="col" className="pb-3 text-right">
                    Answers
                  </th>
                </tr>
              </thead>
              <tbody className="text-secondary divide-border-subtle divide-y">
                <tr>
                  <th scope="row" className="py-4">
                    Brand mentioned
                  </th>
                  <td className="py-4 text-right tabular-nums">30</td>
                </tr>
                <tr>
                  <th scope="row" className="py-4">
                    Brand absent
                  </th>
                  <td className="py-4 text-right tabular-nums">70</td>
                </tr>
              </tbody>
            </table>
            <p className="website-label text-muted mt-3">
              Missing or failed observations are separate.
            </p>
          </div>
          <dl className="bg-canvas-soft space-y-6 p-6 md:p-8">
            <div className="space-y-2">
              <dt className="website-label text-muted">Answer-level mention rate</dt>
              <dd className="website-feature-heading text-foreground tabular-nums">
                30 / 100 = 30%
              </dd>
            </div>
            <div className="space-y-2">
              <dt className="website-label text-muted">Share of tracked brand appearances</dt>
              <dd className="website-feature-heading text-foreground">Not calculated here</dd>
              <dd className="website-body text-secondary">
                Needs competitor counts and a stated counting rule. Multiple brands can appear in
                one answer.
              </dd>
            </div>
          </dl>
        </div>
      )}
      <figcaption className="website-label text-muted border-border-subtle border-t px-6 py-4">
        {kind === 'citation'
          ? 'A teaching example, not a customer result or a live product screenshot.'
          : 'A teaching example, not a benchmark or CiteLadder’s scoring formula.'}
      </figcaption>
    </figure>
  );
}
