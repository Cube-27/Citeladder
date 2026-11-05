import { TextLink } from '@/components/ui/text-link';
import { DEMO_CTA } from '@/lib/marketing-content/nav';

import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { PageHero } from '../sections/heroes';
import { PageSection } from '../sections/page-section';
import { CtaBand, FaqList } from '../sections/steps-faq-cta';

/**
 * Server-safe pricing composition.
 *
 * Plan cards, the comparison table and purchases live in the
 * `pricing-catalog.tsx` client island: every enforceable value comes from
 * `GET /billing/catalog`, which a sync server component cannot read. What
 * remains here carries no catalog value and stays server-rendered. The
 * answers restate published facts (the trial answer in
 * `lib/marketing-content/faq.ts`, the BYOK disclosure and the catalog's
 * currency note); they quote no price.
 */
export const PRICING_FAQS = [
  {
    q: 'What does the free trial include?',
    a: 'Seven days of AI visibility tracking on ChatGPT for one project, with 20 prompts, 20 monitored URLs and 20 successful answers, one per prompt. Agent access and AI credits are not included. Contact us to continue after the trial.',
  },
  {
    q: 'Do you mark up model usage?',
    a: "Not when you use your own API keys. Your providers then bill usage directly to your accounts with no CiteLadder markup, and run speed depends on your providers' rate limits. Other funding options depend on your account setup.",
  },
  {
    q: 'How are my provider keys protected?',
    a: 'Provider secrets are encrypted at rest and resolved only at execution time. They are never returned, logged or placed in a prompt.',
  },
  {
    q: 'Which currency and taxes apply?',
    a: 'Prices show in the currency for your region. Your billing country sets the final currency and tax, confirmed in the app before payment. INR prices exclude GST.',
  },
  {
    q: 'What if a published plan does not fit?',
    a: 'Talk to us about Enterprise. The agreement sets volume, coverage, retention and support.',
  },
] as const;

export function PricingHero() {
  return (
    <PageHero
      crumbs={[{ label: 'Home', href: '/' }, { label: 'Pricing' }]}
      title="No markup on model calls made with your keys"
      lead="When you use your own provider keys, model calls bill to your provider accounts at provider rates. CiteLadder charges for the workspace, the analysis and the evidence behind every recommendation."
    />
  );
}

/** Without a catalog no price is shown, and the page says so. */
export function PricingUnavailable() {
  return (
    <PageSection
      spacing="compact"
      title="Plans are temporarily unavailable"
      lead="Please try again shortly. No price is shown while the public catalog is unavailable."
    />
  );
}

export function PricingFaq() {
  return (
    <PageSection
      id="faq"
      measure="reading"
      title="Pricing questions"
      lead={
        <>
          More answers on data, security and billing in the{' '}
          <TextLink asChild text="inherit">
            <a href="/faq">full FAQ</a>
          </TextLink>
          {'.'}
        </>
      }
    >
      <FaqList items={PRICING_FAQS.map((faq) => ({ question: faq.q, answer: faq.a }))} exclusive />
    </PageSection>
  );
}

/** Closing band: see the product on your own category before choosing. */
export function PricingCta() {
  return (
    <PageSection label="Get started">
      <CtaBand
        title="See it on your own category first"
        lead="Walk through your prompts, competitors and cited sources with us, then pick the volume you need."
        actions={
          <>
            <DemoButtonLink size="marketing">{DEMO_CTA}</DemoButtonLink>
            <ButtonLink href="/enterprise" variant="soft" size="marketing">
              Enterprise
            </ButtonLink>
          </>
        }
      />
    </PageSection>
  );
}
