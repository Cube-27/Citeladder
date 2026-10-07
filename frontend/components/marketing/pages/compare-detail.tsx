import {
  CITELADDER_POSITION,
  COMPARISON_CHECKLIST,
  COMPARISON_DISCLOSURE,
  type Competitor,
} from '@/lib/marketing-content/compare';
import { formatBlogDate } from '@/lib/marketing-content/blog-index';

import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { PageHero } from '../primitives/page-hero';
import { Section, SectionHeader } from '../primitives/section';

/**
 * `/compare/[competitor]` — a side-by-side table of public positioning, one
 * shared evaluation checklist, then the sources and vendor disclosure. Every
 * competitor statement comes from `compare.ts`, where it is tied to a
 * first-party source and its review date.
 */
export function CompareDetailView({ competitor }: Readonly<{ competitor: Competitor }>) {
  const [source] = competitor.sources;
  return (
    <>
      <PageHero
        title={`CiteLadder vs ${competitor.name}`}
        lead={competitor.lead}
        breadcrumb={[
          { label: 'Compare', href: '/compare' },
          { label: `CiteLadder vs ${competitor.name}` },
        ]}
      >
        <p className="website-body text-muted mt-5 max-w-[60ch]">{competitor.context}</p>
      </PageHero>

      <Section rhythm="tight" className="pt-0" aria-labelledby="compare-table-title">
        <h2 id="compare-table-title" className="sr-only">
          Side-by-side comparison
        </h2>
        <div className="ed-table-wrap">
          <table className="ed-table ed-compare website-body">
            <caption className="sr-only">
              CiteLadder and {competitor.name} compared by public product information
            </caption>
            <colgroup>
              <col className="ed-compare-label" />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Aspect</span>
                </th>
                <th scope="col">CiteLadder</th>
                <th scope="col">{competitor.name}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Product focus</th>
                <td data-label="CiteLadder">{CITELADDER_POSITION.focus}</td>
                <td data-label={competitor.name}>{competitor.tagline}</td>
              </tr>
              <tr>
                <th scope="row">Look closer when</th>
                <td data-label="CiteLadder">{CITELADDER_POSITION.when}</td>
                <td data-label={competitor.name}>{competitor.whenBody}</td>
              </tr>
              <tr>
                <th scope="row">Source</th>
                <td data-label="CiteLadder">
                  <a className="ed-link" href="/platform">
                    Platform overview
                  </a>
                </td>
                <td data-label={competitor.name}>
                  {source && (
                    <>
                      <a className="ed-link" href={source.url} target="_blank" rel="noreferrer">
                        {source.label}
                      </a>
                      <span className="text-muted">
                        {' '}
                        · reviewed {formatBlogDate(source.reviewedDate)}
                      </span>
                    </>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section tone="soft" aria-labelledby="compare-checklist-title">
        <div className="mk-split">
          <SectionHeader
            headingId="compare-checklist-title"
            title="Questions to ask both vendors."
            lead="Compare the same use case across vendors rather than one aggregate percentage."
          />
          <ol className="ed-steps" aria-labelledby="compare-checklist-title">
            {COMPARISON_CHECKLIST.map((item) => (
              <li key={item.heading}>
                <h3 className="website-small-heading">{item.heading}</h3>
                <p className="website-body text-muted">{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <Section aria-labelledby="compare-method-title">
        <div className="mk-split">
          <SectionHeader headingId="compare-method-title" title={competitor.conclusionHeading} />
          <div className="grid max-w-[68ch] gap-4">
            <p className="website-body-lg">{competitor.conclusion}</p>
            <p className="website-body-lg text-muted">
              In a CiteLadder demo, inspect a recorded answer, follow its cited sources and review
              the relevant website findings. Confirm the current collection options, plan limits and
              provider setup for your project.
            </p>
          </div>
        </div>
      </Section>

      <Section rhythm="tight" divided aria-label="Comparison sources and disclosure">
        <div className="grid max-w-[68ch] gap-3">
          <p className="website-body text-muted">{COMPARISON_DISCLOSURE}</p>
          {competitor.sources.map((item) => (
            <p className="website-body text-muted" key={item.url}>
              <a className="ed-link" href={item.url} target="_blank" rel="noreferrer">
                {item.label}
              </a>{' '}
              —{' '}
              <time dateTime={item.reviewedDate}>
                Source reviewed {formatBlogDate(item.reviewedDate)}
              </time>
              .
            </p>
          ))}
          <p className="website-body text-muted flex flex-wrap gap-x-5 gap-y-1">
            <a className="ed-link" href="/pricing">
              CiteLadder pricing
            </a>
            <a className="ed-link" href="/platform/citation-intelligence">
              Citation Intelligence
            </a>
            <a className="ed-link" href="/ai-search-share-of-voice">
              AI share of voice
            </a>
          </p>
        </div>
      </Section>

      <Section className="marketing-closing-band" aria-label="Get started">
        <div className="flex flex-col items-center gap-8 text-center" data-cta-placement="closing">
          <SectionHeader
            title="Run the same investigation in both demos."
            lead="Bring a small prompt portfolio and one question your team needs to answer."
            align="center"
          />
          <div className="flex flex-wrap justify-center gap-3">
            <DemoButtonLink size="marketing" />
            <ButtonLink href="/compare" variant="soft" size="marketing">
              All comparisons
            </ButtonLink>
          </div>
        </div>
      </Section>
    </>
  );
}
