import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { Reveal, StaggerGroup, StaggerItem } from '../primitives/reveal';
import { Section } from '../primitives/section';

export function Trust() {
  const { trust } = LANDING_CONTENT;
  return (
    <Section id="trust" tone="sunken" rhythm="base" aria-labelledby="trust-title">
      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
        <Reveal>
          <h2 id="trust-title" className="website-section-heading">
            {trust.title}
          </h2>
        </Reveal>
        <Reveal className="lg:self-center">
          <p className="website-body max-w-[52ch]">{trust.who}</p>
        </Reveal>
      </div>
      <StaggerGroup className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {trust.guarantees.map((guarantee, index) => (
          <StaggerItem
            key={guarantee.title}
            className="border-border-subtle grid gap-3 border-t pt-4"
          >
            <span className="website-label" aria-hidden>
              {String(index + 1).padStart(2, '0')}
            </span>
            <h3 className="website-small-heading">{guarantee.title}</h3>
            <p className="website-body">{guarantee.description}</p>
          </StaggerItem>
        ))}
      </StaggerGroup>
    </Section>
  );
}
