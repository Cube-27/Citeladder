import { ArrowRight } from 'lucide-react';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { ButtonLink, DemoButtonLink } from '../primitives/button';
import { Eyebrow } from '../primitives/label';
import { Section } from '../primitives/section';
import { Reveal } from '../primitives/reveal';

/**
 * The close. One big line and a single primary action, on the page's dark
 * closing band — the dark rebind flips every token beneath it, so the buttons
 * invert to light ink without any call-site colour. Named as a landmark region
 * so the CTA is reachable directly from a screen-reader landmark list rather
 * than only by scrolling the page.
 */
export function FinalCta() {
  const { cta } = LANDING_CONTENT;
  return (
    <Section id="get-started" tone="dark" rhythm="base" aria-label="Get started">
      <Reveal className="mx-auto flex max-w-4xl flex-col items-center text-center">
        <Eyebrow>{cta.kicker}</Eyebrow>
        <h2 className="website-section-heading text-foreground mt-6 max-w-[24ch] text-balance">
          {cta.title}
        </h2>
        <p className="website-lead text-muted mt-4 max-w-[60ch]">{cta.body}</p>
        <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row sm:items-center">
          <DemoButtonLink variant="primary" className="w-full sm:w-auto">
            {cta.primaryCta}
            <ArrowRight aria-hidden />
          </DemoButtonLink>
          <ButtonLink
            href="/pricing"
            variant="ghost"
            className="border-border/80 hover:bg-background-alt w-full border sm:w-auto"
          >
            {cta.secondaryCta}
          </ButtonLink>
        </div>
      </Reveal>
    </Section>
  );
}
