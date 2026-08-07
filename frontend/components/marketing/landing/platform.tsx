import { Check } from 'lucide-react';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { StaggerGroup, StaggerItem } from '../primitives/reveal';
import { Section, SectionHeader } from '../primitives/section';
import { LANDING_ICONS } from './landing-icons';

/**
 * Product architecture — the four intelligence layers. A four-across icon
 * summary sits above four detailed module cards, each carrying its number, an
 * accent-tinted icon tile, and an evidence-checklist. Flat panels with a faint
 * hairline; the one accent is the blue.
 */
export function Platform() {
  const { platform } = LANDING_CONTENT;
  return (
    <Section id="platform" tone="paper" rhythm="base" aria-labelledby="platform-title">
      <SectionHeader
        eyebrow={platform.kicker}
        title={platform.title}
        lead={platform.lead}
        align="center"
        headingId="platform-title"
      />

      {/* Four-across summary — one connected panel divided by hairlines. */}
      <StaggerGroup className="border-border-subtle bg-panel grid overflow-hidden rounded-lg border sm:grid-cols-2 xl:grid-cols-4">
        {platform.summary.map((layer, index) => {
          const Icon = LANDING_ICONS[layer.icon];
          return (
            <StaggerItem
              key={layer.name}
              className={[
                'border-border-subtle p-6',
                index < platform.summary.length - 1 ? 'max-sm:border-b' : '',
                index < 2 ? 'sm:max-xl:border-b' : '',
                index % 2 === 0 ? 'sm:max-xl:border-r' : '',
                index < platform.summary.length - 1 ? 'xl:border-r' : '',
              ].join(' ')}
            >
              <span className="bg-accent-subtle text-accent-text border-accent-border flex size-10 items-center justify-center rounded-lg border">
                <Icon className="size-5" strokeWidth={1.75} aria-hidden />
              </span>
              <h3 className="font-display text-foreground mt-4 text-base">{layer.name}</h3>
              <p className="text-muted mt-2 text-sm leading-relaxed">{layer.desc}</p>
            </StaggerItem>
          );
        })}
      </StaggerGroup>

      {/* Detailed module cards. */}
      <StaggerGroup className="grid gap-5 md:grid-cols-2">
        {platform.modules.map((module) => {
          const Icon = LANDING_ICONS[module.icon];
          return (
            <StaggerItem key={module.num} className="h-full">
              <article className="bg-panel border-border-subtle hover:border-border flex h-full flex-col rounded-lg border p-7 transition-colors duration-300">
                <div className="flex items-start justify-between">
                  <span className="bg-accent-subtle text-accent-text border-accent-border flex size-11 items-center justify-center rounded-lg border">
                    <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="text-subtle font-mono text-xs tabular-nums">{module.num}</span>
                </div>
                <h3 className="font-display text-foreground mt-5 text-lg">{module.title}</h3>
                <p className="text-muted mt-2 text-sm leading-relaxed">{module.description}</p>
                <ul className="mt-5 flex flex-col gap-2">
                  {module.features.map((feature) => (
                    <li key={feature} className="text-secondary flex items-start gap-2 text-sm">
                      <Check className="text-accent-text mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>{feature}</span>
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
