import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

import type { CommercialPage } from '@/lib/marketing-content/commercial-pages';

import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { PageHero } from '../primitives/page-hero';
import { Container, Section, SectionHeader } from '../primitives/section';
import { FaqList } from './platform';

/**
 * A commercial guide as a reading page: a sticky contents rail beside one
 * measured column. `children` (a product module) renders after the guide and
 * before the closing band.
 */
export function CommercialEntryPage({
  page,
  children,
}: Readonly<{ page: CommercialPage; children?: ReactNode }>) {
  const contents = [
    { id: 'definitions', title: page.overview.heading },
    { id: 'method', title: page.workflow.heading },
    { id: 'context', title: page.contextHeading },
    { id: 'questions', title: 'Questions, answered' },
  ];
  return (
    <>
      <PageHero
        title={page.heading}
        lead={page.introduction}
        breadcrumb={[{ label: 'Home', href: '/' }, { label: page.breadcrumb }]}
      >
        <div className="mt-9 flex flex-wrap gap-3" data-cta-placement="hero">
          <DemoButtonLink size="marketing" />
          <ButtonLink href={page.secondary.href} variant="soft" size="marketing">
            {page.secondary.label}
          </ButtonLink>
        </div>
      </PageHero>

      <section aria-label="Guide" className="border-border-subtle border-t">
        <Container className="py-[var(--section-y)]">
          <div className="ed-doc">
            <nav aria-label="On this page" className="ed-rail">
              <p className="website-label ed-rail-title">On this page</p>
              <ol>
                {contents.map((item) => (
                  <li key={item.id}>
                    <a className="website-label" href={`#${item.id}`}>
                      {item.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <article className="ed-prose">
              <section id="definitions" className="ed-prose-section">
                <h2 className="website-section-heading">{page.overview.heading}</h2>
                <p className="website-lead text-muted">{page.overview.lead}</p>
                {page.definitions.map((definition) => (
                  <div key={definition.heading} className="ed-subsection">
                    <h3 className="website-feature-heading">{definition.heading}</h3>
                    <p className="website-body-lg mt-2">{definition.body}</p>
                  </div>
                ))}
                <WorkedExample />
              </section>

              <section id="method" className="ed-prose-section">
                <h2 className="website-section-heading">{page.workflow.heading}</h2>
                <p className="website-body-lg">{page.workflow.lead}</p>
                <ol className="ed-steps">
                  {page.workflow.steps.map((step) => (
                    <li key={step.heading}>
                      <h3 className="website-feature-heading">{step.heading}</h3>
                      <p className="website-body-lg">{step.body}</p>
                    </li>
                  ))}
                </ol>
              </section>

              <section id="context" className="ed-prose-section">
                <h2 className="website-section-heading">{page.contextHeading}</h2>
                <p className="website-body-lg">{page.context}</p>
                <ul className="ed-links" aria-label="Related pages">
                  {page.related.map((link) => (
                    <li key={link.href}>
                      <a className="website-body-lg" href={link.href}>
                        {link.label}
                        <ArrowRight className="size-4" aria-hidden />
                      </a>
                    </li>
                  ))}
                </ul>
              </section>

              <section id="questions" className="ed-prose-section">
                <h2 className="website-section-heading">Questions, answered</h2>
                <FaqList faqs={page.faqs} />
              </section>
            </article>
          </div>
        </Container>
      </section>

      {children}

      <Section className="marketing-closing-band" aria-label="Get started">
        <div className="flex flex-col items-center gap-8 text-center" data-cta-placement="closing">
          <SectionHeader title={page.closingHeading} lead={page.closing} align="center" />
          <DemoButtonLink size="marketing" />
        </div>
      </Section>
    </>
  );
}

/** A static teaching example, deliberately separate from product previews and live metrics. */
function WorkedExample() {
  return (
    <figure className="ed-example">
      <div className="ed-example-body">
        <div>
          <table className="ed-table website-body">
            <caption className="website-small-heading pb-3 text-left">
              100 completed answers
            </caption>
            <thead>
              <tr>
                <th scope="col">Observation</th>
                <th scope="col" className="ed-num">
                  Answers
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Brand mentioned</th>
                <td className="ed-num">30</td>
              </tr>
              <tr>
                <th scope="row">Brand absent</th>
                <td className="ed-num">70</td>
              </tr>
            </tbody>
          </table>
          <p className="website-label text-muted mt-3">
            Missing or failed observations are counted separately.
          </p>
        </div>
        <dl className="ed-example-results">
          <div>
            <dt className="website-label text-muted">Answer-level mention rate</dt>
            <dd className="website-feature-heading tabular-nums">30 / 100 = 30%</dd>
          </div>
          <div>
            <dt className="website-label text-muted">Share of tracked brand appearances</dt>
            <dd className="website-feature-heading">Not calculated here</dd>
            <dd className="website-body text-muted">
              Needs competitor counts and a stated counting rule. Several brands can appear in one
              answer.
            </dd>
          </div>
        </dl>
      </div>
      <figcaption className="website-label text-muted">
        Illustrative example. A teaching aid, not a benchmark or CiteLadder’s scoring formula.
      </figcaption>
    </figure>
  );
}
