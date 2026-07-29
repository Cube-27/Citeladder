import { ArrowRight } from 'lucide-react';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';
import { DEMO_HREF } from '@/lib/marketing-content/nav';

import { ButtonLink } from '../primitives/button';
import { Reveal } from '../primitives/reveal';
import { ProductWindow } from '../scenes/product-window';
import { Section, SectionHeader } from '../primitives/section';

/**
 * The scroll-driving beat: the product itself.
 *
 * This section used to render a second question→verdicts demo, which repeated
 * the hero's ambient panel almost exactly — the page asked the same question
 * twice and answered it the same way, so the scroll bought the reader nothing.
 * The hero states the PROBLEM (engines answer without you); this states the
 * ANSWER, and the answer is the product: a real workspace canvas with one
 * metric opened to the persisted artifact behind it.
 */
export function SeeIt() {
  const { seeIt } = LANDING_CONTENT;
  return (
    <Section id="see-it" tone="field" rhythm="loose" aria-labelledby="see-it-title">
      <SectionHeader
        kicker={seeIt.kicker}
        title={seeIt.title}
        intro={seeIt.intro}
        headingId="see-it-title"
      />
      <Reveal>
        <ProductWindow />
      </Reveal>
      <div className="mt-10 flex justify-center">
        <ButtonLink href={DEMO_HREF} intent="proof" className="w-full sm:w-auto">
          {seeIt.cta}
          <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      </div>
    </Section>
  );
}
