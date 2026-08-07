import { ChevronRight } from 'lucide-react';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { StaggerGroup, StaggerItem } from '../primitives/reveal';
import { Section, SectionHeader } from '../primitives/section';
import { LANDING_ICONS } from './landing-icons';

/**
 * Use cases — six industry packs, each an icon, a name, its maturity status, and
 * the concrete checks it ships. Status is `text-muted` (Pewter), which clears
 * WCAG AA on the paper band, not the lighter Silver Fog.
 */
export function Packs() {
  const { packs } = LANDING_CONTENT;
  return (
    <Section id="industry-packs" tone="paper" rhythm="base" aria-labelledby="packs-title">
      <SectionHeader
        eyebrow={packs.kicker}
        title={packs.title}
        lead={packs.lead}
        headingId="packs-title"
      />
      <StaggerGroup className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {packs.items.map((pack) => {
          const Icon = LANDING_ICONS[pack.icon];
          return (
            <StaggerItem key={pack.name} className="h-full">
              <article className="bg-panel border-border-subtle hover:border-border flex h-full flex-col rounded-lg border p-6 transition-colors duration-300">
                <div className="flex items-center gap-3">
                  <span className="bg-accent-subtle text-accent-text border-accent-border flex size-9 items-center justify-center rounded-lg border">
                    <Icon className="size-4.5" strokeWidth={1.75} aria-hidden />
                  </span>
                  <h3 className="font-display text-foreground text-base">{pack.name}</h3>
                </div>
                <p className="text-muted mt-4 text-xs tracking-wide uppercase">{pack.status}</p>
                <ul className="mt-4 flex flex-col gap-2">
                  {pack.points.map((point) => (
                    <li key={point} className="text-secondary flex items-start gap-2 text-sm">
                      <ChevronRight className="text-accent-text mt-0.5 size-3.5 shrink-0" aria-hidden />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </StaggerItem>
          );
        })}
      </StaggerGroup>
    </Section>
  );
}
