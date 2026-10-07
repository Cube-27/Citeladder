import { DEMO_CTA } from '@/lib/marketing-content/nav';

import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { Section, SectionHeader } from '../primitives/section';
import { FaqList } from './platform';

/**
 * Server-safe pricing composition.
 *
 * Plan cards, the comparison table and purchases live in the
 * `components/marketing/pricing/*` client island: every enforceable value
 * comes from `GET /billing/catalog`, which a sync server component cannot
 * read. What remains here carries no catalog value and stays server-rendered.
 * The answers restate published facts (the trial answer in
 * `lib/marketing-content/faq.ts`, the BYOK disclosure and the catalog's
 * currency note); they quote no price.
 */
const PRICING_FAQS = [
  {
    q: 'What does the free trial include?',
    a: 'Seven days of AI visibility tracking on ChatGPT for one project, with 20 prompts, 20 monitored URLs and 20 successful answers, one per prompt. Agent access and AI credits are not included. Contact us to continue after the trial.',
  },
  {
    q: 'Do you mark up model usage?',
    a: 'Not when you use your own API keys. Provider usage then bills directly to your provider accounts with no CiteLadder markup, and run speed depends on your providers’ rate limits. Other funding options depend on your account setup.',
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
    a: 'Talk to us about Enterprise. Volume, coverage, retention and support are set by agreement.',
  },
] as const;

export function PricingFaq() {
  return (
    <Section tone="paper" divided aria-label="Pricing questions">
      <div className="mk-split">
        <SectionHeader
          title="Pricing questions."
          lead={
            <>
              More answers on data, security and billing in the{' '}
              <a href="/faq" className="text-accent-text underline underline-offset-2">
                full FAQ
              </a>
              {'.'}
            </>
          }
        />
        <FaqList faqs={PRICING_FAQS} />
      </div>
    </Section>
  );
}

/** Closing band: see the product on your own category before choosing. */
export function PricingCta() {
  return (
    <Section className="marketing-closing-band" aria-label="Get started">
      <div className="flex flex-col items-center gap-8 text-center" data-cta-placement="closing">
        <SectionHeader
          title="See it on your own category first."
          lead="Walk through your prompts, competitors and cited sources with us, then pick the volume you need."
          align="center"
        />
        <div className="flex flex-wrap justify-center gap-3">
          <DemoButtonLink size="marketing">{DEMO_CTA}</DemoButtonLink>
          <ButtonLink href="/enterprise" variant="soft" size="marketing">
            Enterprise
          </ButtonLink>
        </div>
      </div>
    </Section>
  );
}
