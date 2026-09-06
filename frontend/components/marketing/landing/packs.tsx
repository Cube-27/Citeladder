import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { StaggerGroup, StaggerItem } from '../primitives/reveal';
import { Section, SectionHeader } from '../primitives/section';
import { LANDING_ICONS, LANDING_TILES } from './landing-icons';

/**
 * Use cases — six industry contexts as a quiet editorial grid, not a card wall:
 * one icon tile, one name, one line. The industries are the content; boxes
 * would just frame six sentences of the same idea.
 */
const ITEM_TILES = ['blue', 'indigo', 'purple', 'green'] as const;

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
      <StaggerGroup className="grid gap-x-8 gap-y-10 md:grid-cols-2 xl:grid-cols-3">
        {packs.items.map((pack, index) => {
          const Icon = LANDING_ICONS[pack.icon];
          return (
            <StaggerItem key={pack.name}>
              <div className="flex items-start gap-4">
                <span
                  className={`${LANDING_TILES[ITEM_TILES[index % ITEM_TILES.length]]} flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)]`}
                >
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <div>
                  <h3 className="website-small-heading text-foreground">{pack.name}</h3>
                  <p className="website-body text-muted mt-1.5">{pack.benefit}</p>
                </div>
              </div>
            </StaggerItem>
          );
        })}
      </StaggerGroup>
    </Section>
  );
}
