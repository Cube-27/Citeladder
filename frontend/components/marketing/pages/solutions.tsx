import { DEMO_HREF } from '@/lib/marketing-content/nav';
import { SOLUTION_SEGMENTS, SOLUTIONS_HERO } from '@/lib/marketing-content/solutions';

import { SiteActions } from '../primitives/button';
import { FeatureSplit } from '../sections/features';
import { PageHero } from '../sections/heroes';
import { PageSection } from '../sections/page-section';
import { CtaBand } from '../sections/steps-faq-cta';
import { CatalogFrame } from '../screens/screen-catalog';

export function SolutionsPage() {
  return (
    <>
      <PageHero
        crumbs={[{ label: 'Home', href: '/' }, { label: 'Solutions' }]}
        title={SOLUTIONS_HERO.title}
        lead={SOLUTIONS_HERO.lead}
        actions={<SiteActions />}
      />
      {SOLUTION_SEGMENTS.map((segment, index) => (
        <PageSection
          key={segment.id}
          id={segment.id}
          label={segment.label}
          spacing={index === 0 ? 'compact' : 'default'}
        >
          <FeatureSplit
            as="h2"
            title={segment.title}
            body={segment.body ? [segment.lead, segment.body] : segment.lead}
            links={[
              ...(segment.guide ? [segment.guide] : []),
              { href: DEMO_HREF, label: segment.cta, demo: true },
            ]}
            reverse={index % 2 === 1}
            media={<CatalogFrame screen={segment.screen} />}
          />
        </PageSection>
      ))}
      <PageSection label="Get started">
        <CtaBand
          title="See the workflow that matches how you are measured"
          lead="Each team reads the same evidence differently. We will walk through the view your team reports on."
          actions={<SiteActions />}
        />
      </PageSection>
    </>
  );
}
