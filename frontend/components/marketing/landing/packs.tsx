import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { StaggerGroup, StaggerItem } from '../primitives/reveal';
import { Section, SectionHeader } from '../primitives/section';

export function Packs() {
  const { packs } = LANDING_CONTENT;
  return (
    <Section id="use-cases" tone="paper" rhythm="base" aria-labelledby="packs-title">
      <SectionHeader title={packs.title} lead={packs.lead} headingId="packs-title" />
      <StaggerGroup className="grid gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
        {packs.items.map((pack, index) => (
          <StaggerItem key={pack.name} className="border-border-subtle grid gap-3 border-t pt-4">
            <span className="website-label" aria-hidden>
              {String(index + 1).padStart(2, '0')}
            </span>
            <h3 className="website-small-heading">{pack.name}</h3>
            <p className="website-body">{pack.benefit}</p>
          </StaggerItem>
        ))}
      </StaggerGroup>
    </Section>
  );
}
