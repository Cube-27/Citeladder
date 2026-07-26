import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { Section, SectionHeader } from '../primitives/section';
import { Reveal } from '../primitives/reveal';
import { ProductWindow } from '../scenes/product-window';

/** The product chapter: one canvas, shown at full width. */
export function Platform() {
  const { platform } = LANDING_CONTENT;
  return (
    <Section id="platform" rhythm="loose" divided aria-labelledby="platform-title">
      <SectionHeader
        index={platform.index}
        kicker={platform.kicker}
        title={platform.title}
        intro={platform.intro}
        headingId="platform-title"
      />
      <Reveal>
        <ProductWindow />
      </Reveal>
    </Section>
  );
}
