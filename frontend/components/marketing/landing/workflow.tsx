import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { StaggerGroup, StaggerItem } from '../primitives/reveal';
import { Section, SectionHeader } from '../primitives/section';
import { LANDING_ICONS } from './landing-icons';

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
        {/* Connector — a hairline above the four steps on wide screens, run
            edge to edge so it reads as one ledger rule rather than a decoration
            threaded between icons. */}
        <div
          aria-hidden
          className="bg-border-subtle absolute inset-x-0 top-0 hidden h-px xl:block"
        />
        <StaggerGroup className="relative grid gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-4">
          {workflow.steps.map((step) => {
            const Icon = LANDING_ICONS[step.icon];
            return (
              <StaggerItem key={step.num} className="flex flex-col items-start xl:pt-8">
                <div className="flex items-center gap-3">
                  <span className="bg-accent-subtle text-accent-text flex size-9 items-center justify-center rounded-[var(--radius-control)]">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="text-subtle font-mono text-xs tabular-nums">{step.num}</span>
                </div>
                <h3 className="website-small-heading text-foreground mt-4">{step.label}</h3>
                <p className="website-body text-muted mt-2 max-w-[34ch]">{step.desc}</p>
              </StaggerItem>
            );
          })}
        </StaggerGroup>
      </div>
    </Section>
  );
}
