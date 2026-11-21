import { Callout } from '@/components/ui/callout';
import { TextLink } from '@/components/ui/text-link';
import { PUBLIC_TRIAL } from '@/lib/config/public-trial';
import { countWord, countWordCapitalized, projectCount } from '@/lib/marketing-content/count-words';

import { SiteActions } from '../primitives/button';
import { PageHero } from '../sections/heroes';
import { PageSection } from '../sections/page-section';
import { CtaBand, FaqList } from '../sections/steps-faq-cta';
import '../sections/pricing.css';

const trialProjects = projectCount(PUBLIC_TRIAL.projects);

export const PRICING_FAQS = [
  {
    q: 'What does the free trial include?',
    a: `${countWordCapitalized(PUBLIC_TRIAL.days)} days of AI visibility tracking on ChatGPT for ${trialProjects}, with ${PUBLIC_TRIAL.prompts} prompts, ${PUBLIC_TRIAL.monitoredUrls} monitored URLs and ${PUBLIC_TRIAL.answers} successful answers, one per prompt. It includes ${PUBLIC_TRIAL.aiCredits} AI credits; Agent access is not included. Contact us to continue after the trial.`,
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

export function PricingHero({ checkoutOpen = false }: Readonly<{ checkoutOpen?: boolean }>) {
  const trial = `${countWordCapitalized(PUBLIC_TRIAL.days)} days of AI visibility tracking on ChatGPT for ${trialProjects}, with ${PUBLIC_TRIAL.prompts} prompts and ${PUBLIC_TRIAL.monitoredUrls} monitored URLs.`;
  return (
    <PageHero
      crumbs={[{ label: 'Home', href: '/' }, { label: 'Pricing' }]}
      title={`Start with a ${countWord(PUBLIC_TRIAL.days)}-day free trial`}
      lead={
        checkoutOpen
          ? `${trial} Paid plans are below, or contact us.`
          : `${trial} Paid checkout is not open yet: contact us for a paid plan.`
      }
      actions={<SiteActions />}
    />
  );
}

export function PricingKeys() {
  return (
    <PageSection
      id="your-keys"
      title="No markup on model calls made with your keys"
      lead="Use your own AI provider keys and pay their rates directly, with no markup from us."
    />
  );
}

export function PricingUnavailable() {
  return (
    <PageSection spacing="compact" label="Plans" labelHeading>
      <Callout tone="neutral" title="Plans are temporarily unavailable">
        Please try again shortly. No price is shown while the public catalog is unavailable.
      </Callout>
    </PageSection>
  );
}

export function PricingFaq() {
  return (
    <PageSection
      id="faq"
      layout="aside"
      title="Frequently asked questions"
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

export function PricingCta() {
  return (
    <PageSection label="Get started">
      <CtaBand
        title="See it on your own category first"
        lead="Walk through your prompts, competitors and cited sources with us, then pick the volume you need."
        actions={<SiteActions />}
      />
    </PageSection>
  );
}
