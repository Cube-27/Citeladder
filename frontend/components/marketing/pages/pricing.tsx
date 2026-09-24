import { ArrowRight } from 'lucide-react';

import { DEMO_CTA } from '@/lib/marketing-content/nav';

import { ButtonLink, DemoButtonLink } from '../primitives/button';
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
    <Section tone="paper" rhythm="base" className="marketing-closing-band" aria-label="Get started">
      <Reveal className="mx-auto max-w-5xl text-center">
        <h2 className="website-section-heading origin-centre text-foreground mx-auto mb-5 max-w-[32ch]">
          Start from the evidence, not the invoice.
        </h2>
        <p className="website-lead text-muted mx-auto max-w-[75ch]">
          Walk through your own category with us, then pick the plan that matches the volume you
          actually need.
        </p>
        <div className="mt-8 flex items-stretch justify-center gap-3 sm:items-center sm:gap-4">
          <DemoButtonLink className="min-w-0 flex-1 sm:flex-none">
            {DEMO_CTA}
            <ArrowRight aria-hidden />
          </DemoButtonLink>
          <ButtonLink href="/faq" variant="ghost" className="min-w-0 flex-1 sm:flex-none">
            Read the FAQ
          </ButtonLink>
        </div>
      </Reveal>
    </Section>
  );
}
