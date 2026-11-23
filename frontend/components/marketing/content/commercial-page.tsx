import { FactList } from '@/components/ui/facts';
import type { CommercialPage } from '@/lib/marketing-content/commercial-pages';
import { platformLabel } from '@/lib/marketing-content/nav';

import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { ProductFrame } from '../screens/product-frame';
import { CatalogFrame, MODULE_SCREENS, SCREEN_CATALOG } from '../screens/screen-catalog';
import { RelatedCards } from '../sections/cards';
import { Bento, FeatureCard, FeatureSplit } from '../sections/features';
import { PageHero } from '../sections/heroes';
import { PageSection } from '../sections/page-section';
import { CtaBand, FaqList, Steps } from '../sections/steps-faq-cta';
import './reading.css';

type CommercialProduct = Readonly<{
  heading: string;
  body: string;
  href: '/platform/ai-visibility';
}>;

export function CommercialEntryPage({
  page,
  product,
}: Readonly<{ page: CommercialPage; product: CommercialProduct }>) {
  const HeroScreen = SCREEN_CATALOG.visibility.View;
  return (
    <>
      <PageHero
        size="2xl"
        entrance
        crumbs={[{ label: 'Home', href: '/' }, { label: page.breadcrumb }]}
        title={page.heading}
        lead={page.introduction}
        actions={
          <>
            <DemoButtonLink />
            <ButtonLink href={page.secondary.href} variant="soft">
              {page.secondary.label}
            </ButtonLink>
          </>
        }
      >
        <ProductFrame label="AI Visibility" fit="scale">
          <HeroScreen />
        </ProductFrame>
      </PageHero>

      <PageSection id="definitions" title={page.overview.heading} lead={page.overview.lead}>
        <Bento
          cells={page.definitions.map((definition) => ({
            key: definition.heading,
            span: 6,
            content: <FeatureCard title={definition.heading} body={definition.body} />,
          }))}
        />
        <WorkedExample />
      </PageSection>

      <PageSection id="method" title={page.workflow.heading} lead={page.workflow.lead}>
        <Steps
          items={page.workflow.steps.map((step) => ({ title: step.heading, body: step.body }))}
        />
      </PageSection>

      <PageSection label={product.heading}>
        <FeatureSplit
          as="h2"
          title={product.heading}
          body={product.body}
          links={[{ href: product.href, label: `Explore ${platformLabel(product.href)}` }]}
          media={<CatalogFrame screen={MODULE_SCREENS[product.href].screen} />}
        />
      </PageSection>

      <PageSection id="context" title={page.contextHeading} lead={page.context} spacing="compact">
        <RelatedCards
          items={page.related.map((link) => ({ href: link.href, title: link.label }))}
        />
      </PageSection>

      <PageSection id="questions" title="Frequently asked questions" layout="aside">
        <FaqList items={page.faqs.map((faq) => ({ question: faq.q, answer: faq.a }))} />
      </PageSection>

      <PageSection label="Get started">
        <CtaBand title={page.closingHeading} lead={page.closing} actions={<DemoButtonLink />} />
      </PageSection>
    </>
  );
}

function WorkedExample() {
  return (
    <figure className="cl-prose cl-sov-example">
      <div className="cl-prose-table">
        <table>
          <caption>100 completed answers</caption>
          <thead>
            <tr>
              <th scope="col">Observation</th>
              <th scope="col">Answers</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Brand mentioned</th>
              <td>30</td>
            </tr>
            <tr>
              <th scope="row">Brand absent</th>
              <td>70</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>Missing or failed observations are counted separately.</p>
      <FactList
        layout="ruled"
        facts={[
          { label: 'Answer-level mention rate', value: '30 / 100 = 30%' },
          {
            label: 'Share of tracked brand appearances',
            value: (
              <span className="grid gap-1">
                <span>Not calculated here</span>
                <span>
                  Needs competitor counts and a stated counting rule. Several brands can appear in
                  one answer.
                </span>
              </span>
            ),
          },
        ]}
      />
      <figcaption>
        Illustrative example. A teaching aid, not a benchmark or CiteLadder&apos;s scoring formula.
      </figcaption>
    </figure>
  );
}
