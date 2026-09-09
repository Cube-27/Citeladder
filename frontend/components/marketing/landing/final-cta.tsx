import { ArrowRight } from 'lucide-react';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { DemoButtonLink } from '../primitives/button';
import { Eyebrow } from '../primitives/label';
import { Section } from '../primitives/section';
import { Reveal } from '../primitives/reveal';

/**
 * The close uses the shared paper section and primary action. Named as a
 * landmark region so the CTA is reachable
 * directly from a screen-reader landmark list rather than only by scrolling
 * the page.
 */
export function FinalCta() {
  const { cta } = LANDING_CONTENT;
  return (
    <Section id="get-started" tone="paper" rhythm="base" aria-label="Get started">
      <Reveal className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <div className="border-border-subtle bg-panel inline-flex items-center rounded-full border px-3.5 py-1 shadow-xs">
          <Eyebrow>{cta.kicker}</Eyebrow>
        </div>
        <h2 className="website-section-heading origin-centre text-foreground mt-6 text-balance">
          {cta.title}
        </h2>
        <p className="website-lead text-muted mt-4 max-w-[56ch]">{cta.body}</p>
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
