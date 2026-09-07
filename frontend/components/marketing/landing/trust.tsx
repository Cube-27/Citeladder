import { LANDING_CONTENT } from '@/lib/marketing-content/landing';
import { cn } from '@/lib/utils';

import { Reveal, StaggerGroup, StaggerItem } from '../primitives/reveal';
import { Section } from '../primitives/section';
import { LANDING_ICONS, LANDING_TILES } from './landing-icons';

/**
 * Enterprise trust — the promise and its audience statement share the top
 * split, then one four-up row of icon-tiled guarantees carries the detail.
 */
export function Trust() {
  const { trust } = LANDING_CONTENT;
  return (
    <Section id="trust" tone="sunken" rhythm="base" aria-labelledby="trust-title">
      <div className="grid gap-x-16 gap-y-6 lg:grid-cols-2">
        <Reveal>
          <h2
            id="trust-title"
            className="website-section-heading text-foreground mt-3 text-balance"
          >
            {trust.title}
          </h2>
        </Reveal>
        <Reveal className="lg:self-center">
          <p className="website-body text-muted max-w-[52ch]">{trust.who}</p>
        </Reveal>
      </div>

      {/* The extra top margin keeps the four-up row clear of the compact
          header split above it — the container gap alone reads as cramped. */}
      <StaggerGroup className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2 md:mt-12 xl:grid-cols-4">
        {trust.guarantees.map((guarantee) => {
          const Icon = LANDING_ICONS[guarantee.icon];
          return (
            <StaggerItem
              key={guarantee.title}
              className="hover:border-border-subtle/80 hover:bg-background-alt/50 -m-3 flex items-start gap-4 rounded-[var(--radius-card)] border border-transparent p-3.5 transition-all duration-200"
            >
              <span
                className={cn(
                  'shadow-xs flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-card)]',
                  LANDING_TILES[guarantee.tile],
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                {/* Same title rung as the reveal/loop item headers so the
                    three sections read identically. `website-body` pins 400
                    and utility weight overrides lose the cascade to it, so a
                    heavier weight has to come from the type ladder. */}
                <h3 className="website-small-heading text-foreground">{guarantee.title}</h3>
                <p className="website-body text-muted mt-1.5">{guarantee.description}</p>
              </div>
            </StaggerItem>
          );
        })}
      </StaggerGroup>
    </Section>
  );
}
