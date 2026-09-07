import { ArrowRight } from 'lucide-react';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { DemoButtonLink } from '../primitives/button';
import { Eyebrow } from '../primitives/label';
import { Section } from '../primitives/section';
import { Reveal } from '../primitives/reveal';

/**
 * The close. One headline and a single primary action on the deep-teal band —
 * the resolving chord of the three-canvas system (docs/design.md §Marketing).
 * The teal rebind (`data-citeladder-section='teal'`) flips every token beneath
 * it, so the button inverts to the white canvas with a teal label without any
 * call-site colour. Named as a landmark region so the CTA is reachable
 * directly from a screen-reader landmark list rather than only by scrolling
 * the page.
 */
export function FinalCta() {
  const { cta } = LANDING_CONTENT;
  return (
    <Section id="get-started" tone="teal" rhythm="base" aria-label="Get started">
      <Reveal className="mx-auto flex max-w-4xl flex-col items-center text-center">
        <Eyebrow>{cta.kicker}</Eyebrow>
        <h2 className="website-section-heading origin-centre text-foreground mt-6 text-balance">
          {cta.title}
        </h2>
        <p className="website-lead text-muted mt-4 max-w-[60ch]">{cta.body}</p>
        <div className="mt-8">
          <DemoButtonLink className="w-full sm:w-auto">
            {cta.primaryCta}
            <ArrowRight aria-hidden />
          </DemoButtonLink>
        </div>
      </Reveal>
    </Section>
  );
}
