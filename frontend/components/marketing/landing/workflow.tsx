import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { StaggerGroup, StaggerItem } from '../primitives/reveal';
import { Section, SectionHeader } from '../primitives/section';
import { LANDING_ICONS, LANDING_TILES } from './landing-icons';

export function Workflow() {
  const { workflow } = LANDING_CONTENT;
  return (
    <Section id="how-it-works" tone="sunken" rhythm="base" aria-labelledby="workflow-title">
      <SectionHeader
        eyebrow={workflow.kicker}
        title={workflow.title}
        lead={workflow.lead}
        headingId="workflow-title"
      />
      <div className="relative">
        {/* Connector — a dashed rule through the tile rung on wide screens,
            running behind the opaque tiles so it shows only in the gaps
            between steps. Below `xl` the grid folds to two columns and the
            rule would cross rows, so it drops out. */}
        <div
          aria-hidden
          className="border-border absolute inset-x-0 top-6 hidden border-t border-dashed xl:block"
        />
        <StaggerGroup className="relative grid gap-x-8 gap-y-10 sm:grid-cols-2 xl:grid-cols-4">
          {workflow.steps.map((step) => {
            const Icon = LANDING_ICONS[step.icon];
            return (
              <StaggerItem key={step.stage} className="flex flex-col items-start">
                <span
                  className={`flex size-12 items-center justify-center rounded-[var(--radius-card)] ${LANDING_TILES[step.tile]}`}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="website-label text-muted mt-4 uppercase">{step.stage}</span>
                <h3 className="website-small-heading text-foreground mt-2">{step.label}</h3>
                <p className="website-body text-muted mt-2 max-w-[34ch]">{step.desc}</p>
              </StaggerItem>
            );
          })}
        </StaggerGroup>
      </div>
    </Section>
  );
}
