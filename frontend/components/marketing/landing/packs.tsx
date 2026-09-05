import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { StaggerGroup, StaggerItem } from '../primitives/reveal';
import { Section, SectionHeader } from '../primitives/section';
import { LANDING_ICONS } from './landing-icons';

/**
 * Use cases — six industry contexts showing how measuring AI visibility benefits
 * brands across different markets.
 */
export function Packs() {
  const { packs } = LANDING_CONTENT;
  return (
    <Section id="use-cases" tone="paper" rhythm="base" aria-labelledby="packs-title">
      <SectionHeader
        eyebrow={packs.kicker}
        title={packs.title}
        lead={packs.lead}
        headingId="packs-title"
      />
      <StaggerGroup className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {packs.items.map((pack) => {
          const Icon = LANDING_ICONS[pack.icon];
          return (
            <StaggerItem key={pack.name} className="h-full">
              <article className="bg-panel shadow-card hover:shadow-card-hover group flex h-full flex-col rounded-[var(--radius-card)] p-6 transition-all duration-200 hover:-translate-y-0.5 sm:p-7">
                <div className="flex items-center gap-3">
                  <span className="bg-accent-subtle text-accent-text flex size-9 items-center justify-center rounded-[var(--radius-control)]">
                    <Icon className="size-4.5" aria-hidden />
                  </span>
                  <h3 className="website-small-heading text-foreground group-hover:text-accent-text transition-colors">
                    {pack.name}
                  </h3>
                </div>
                <p className="website-body text-muted mt-4 leading-relaxed">{pack.benefit}</p>
              </article>
            </StaggerItem>
          );
        })}
      </StaggerGroup>
    </Section>
  );
}
