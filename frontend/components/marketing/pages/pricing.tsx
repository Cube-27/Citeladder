import { ArrowRight } from 'lucide-react';

import { DEMO_CTA, DEMO_HREF } from '@/lib/marketing-content/nav';

import { ButtonLink } from '../primitives/button';
import { Section } from '../primitives/section';
import { Reveal } from '../primitives/reveal';

/**
 * Server-safe pricing composition.
 *
 * The plan cards, comparison grid and purchases moved to the
 * `components/marketing/pricing/*` client island: every enforceable value now
 * comes from `GET /billing/catalog`, and a sync server component cannot read
 * it. What remains here is the closing band, which carries no commercial terms
 * and stays server-rendered.
 */

/** Closing band — evaluation first, then the workspace. */
export function PricingCta() {
  return (
    <Section tone="paper" rhythm="base" aria-label="Get started">
      <Reveal className="mx-auto max-w-5xl text-center">
        <h2 className="font-mkt-display text-mkt-h2 text-mkt-ink mb-mkt-20 mx-auto max-w-[32ch]">
          Start from the evidence, not the invoice.
        </h2>
        <p className="text-mkt-lead text-mkt-ink-soft mx-auto max-w-[80ch]">
          Walk through your own category with us, then pick the plan that matches the volume you
          actually need.
        </p>
        <div className="mt-mkt-30 gap-mkt-14 flex flex-col items-center justify-center sm:flex-row">
          <ButtonLink href={DEMO_HREF} className="w-full sm:w-auto">
            {DEMO_CTA}
            <ArrowRight aria-hidden />
          </ButtonLink>
          <ButtonLink href="/faq" variant="ghost" className="w-full sm:w-auto">
            Read the FAQ
          </ButtonLink>
        </div>
      </Reveal>
    </Section>
  );
}
