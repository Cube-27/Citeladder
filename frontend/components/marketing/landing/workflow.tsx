import { LANDING_CONTENT } from '@/lib/marketing-content/landing';
import { cn } from '@/lib/utils';

import { StaggerGroup, StaggerItem } from '../primitives/reveal';
import { Section, SectionHeader } from '../primitives/section';
import { LANDING_ICONS, LANDING_TILE_INKS, LANDING_TILES } from './landing-icons';

/**
 * The operating loop — four steps as full pastel panels on the reference
 * system's model (docs/design.md §Marketing): each stage lives on its own
 * product-hue band, the way the reference site tints its numbered lifecycle
 * steps. Colour is decorative rhythm only; the stage label names the step.
 */
export function Workflow() {
  const { workflow } = LANDING_CONTENT;
  return (
    <Section id="how-it-works" tone="sunken" rhythm="base" aria-labelledby="workflow-title">
      <SectionHeader title={workflow.title} lead={workflow.lead} headingId="workflow-title" />
      <StaggerGroup className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {workflow.steps.map((step) => {
          const Icon = LANDING_ICONS[step.icon];
          return (
            <StaggerItem key={step.stage} className="h-full">
              <article
                className={cn(
                  'flex h-full flex-col rounded-[var(--radius-card)] p-6',
                  LANDING_TILES[step.tile],
                )}
              >
                <span className="bg-panel flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)]">
                  <Icon className={cn('size-4.5', LANDING_TILE_INKS[step.tile])} aria-hidden />
                </span>
                <span className="website-label mt-5 uppercase">{step.stage}</span>
                <h3 className="website-small-heading text-foreground mt-2">{step.label}</h3>
                <p className="website-body text-secondary mt-2">{step.desc}</p>
              </article>
            </StaggerItem>
          );
        })}
      </StaggerGroup>
    </Section>
  );
}
