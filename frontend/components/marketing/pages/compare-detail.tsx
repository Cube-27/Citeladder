import { ArrowLeft } from 'lucide-react';

import {
  COMPARISON_CHECKLIST,
  COMPARISON_DISCLOSURE,
  type Competitor,
} from '@/lib/marketing-content/compare';
import { formatBlogDate } from '@/lib/marketing-content/blog-index';
import { DemoButtonLink } from '../primitives/button';
import { Eyebrow } from '../primitives/label';
import { Container, Section, SectionHeader } from '../primitives/section';
import { Reveal } from '../primitives/reveal';

/** Vendor-specific positioning surrounds one shared evaluation checklist. */
export function CompareDetailView({ competitor }: Readonly<{ competitor: Competitor }>) {
  return (
    <>
      <header className="border-border-subtle border-b pt-16 pb-6 md:pb-8">
        <Container dense>
          <Reveal className="max-w-5xl">
            <a
              href="/compare"
              className="text-muted hover:text-foreground mb-5 flex w-fit items-center gap-2 text-sm font-medium transition-colors"
            >
              <ArrowLeft className="size-4" aria-hidden /> All comparisons
            </a>
            <Eyebrow>Comparison</Eyebrow>
            <h1 className="website-page-title text-foreground mt-4 max-w-[28ch] text-balance">
              CiteLadder vs <em className="text-accent-text not-italic">{competitor.name}</em>
            </h1>
            <p className="website-body-lg text-muted mt-5 max-w-3xl">{competitor.lead}</p>
            <p className="website-body-lg text-muted mt-5 max-w-3xl">
              {competitor.context}{' '}
              {competitor.sources.map((source) => (
                <span key={source.url}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent-text underline underline-offset-2"
                  >
                    {source.label}
                  </a>
                  {'.'}
                </span>
              ))}
            </p>
          </Reveal>
        </Container>
      </header>
      <Section rhythm="tight">
        <div className="max-w-3xl space-y-5">
          <SectionHeader title={`When to examine ${competitor.name} more closely`} />
          <p className="website-body-lg text-muted">{competitor.whenBody}</p>
        </div>
      </Section>
      <Section tone="sunken" rhythm="tight">
        <div className="max-w-3xl space-y-5">
          <SectionHeader title="Questions to answer before choosing a platform" />
          <ol className="website-body-lg text-muted list-decimal space-y-4 pl-6">
            {COMPARISON_CHECKLIST.map((item) => (
              <li key={item.heading}>
                <strong className="text-foreground">{item.heading}:</strong> {item.body}
              </li>
            ))}
          </ol>
        </div>
      </Section>
      <Section rhythm="tight">
        <div className="max-w-3xl space-y-5">
          <SectionHeader title="What to evaluate in CiteLadder" />
          <p className="website-body-lg text-muted">
            CiteLadder brings tracked brand observations, source analysis and Site Health into a
            shared workflow. During a demo, inspect a recorded answer, follow its cited sources and
            review the relevant website findings.
          </p>
          <p className="website-body-lg text-muted">
            Confirm the current collection options, plan limits and provider setup for your project.
            Compare the same use case across vendors rather than relying on one aggregate
            percentage.
          </p>
        </div>
      </Section>
      <Section tone="sunken" rhythm="tight">
        <div className="max-w-3xl space-y-5">
          <SectionHeader title={competitor.conclusionHeading} />
          <p className="website-body-lg text-muted">{competitor.conclusion}</p>
        </div>
      </Section>
      <Section rhythm="tight" aria-label="Comparison sources and disclosure">
        <div className="max-w-3xl space-y-5">
          <p className="website-body text-muted">{COMPARISON_DISCLOSURE}</p>
          {competitor.sources.map((source) => (
            <p className="website-body text-muted" key={source.url}>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="text-accent-text underline underline-offset-2"
              >
                {source.label}
              </a>{' '}
              —{' '}
              <time dateTime={source.reviewedDate}>
                Source reviewed {formatBlogDate(source.reviewedDate)}
              </time>
              .
            </p>
          ))}
          <p className="website-body text-accent-text">
            <a className="underline" href="/pricing">
              CiteLadder pricing
            </a>{' '}
            ·{' '}
            <a className="underline" href="/platform/citation-intelligence">
              Citation Intelligence
            </a>{' '}
            ·{' '}
            <a className="underline" href="/ai-search-share-of-voice">
              AI share of voice
            </a>
          </p>
          <DemoButtonLink />
        </div>
      </Section>
    </>
  );
}
