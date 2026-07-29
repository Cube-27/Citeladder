import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { StaggerGroup, StaggerItem } from '../primitives/reveal';
import { Section, SectionHeader } from '../primitives/section';

/**
 * The problem, stated as three sharp facts. No cards, no wallpaper — a big
 * numbered statement per fact, set at full width so the type carries the
 * hierarchy instead of a boxed panel. This is the beat that turns the hook's
 * claim into a mechanism the buyer recognises from their own behaviour.
 */
export function Shift() {
  const { shift } = LANDING_CONTENT;
  return (
    <Section id="why" tone="paper" rhythm="loose" aria-labelledby="shift-title">
      <SectionHeader kicker={shift.kicker} title={shift.title} headingId="shift-title" />
      <StaggerGroup className="grid gap-12 lg:grid-cols-3">
        {shift.facts.map((fact) => (
          <StaggerItem key={fact.num}>
            <p className="text-mkt-proof text-mkt-meta font-mono tabular-nums">{fact.num}</p>
            <h3 className="font-mkt-display text-mkt-ink text-mkt-d4 mt-4 max-w-[16ch]">
              {fact.title}
            </h3>
            <p className="text-mkt-body text-mkt-ink-soft mt-4 max-w-[38ch]">{fact.body}</p>
          </StaggerItem>
        ))}
      </StaggerGroup>
    </Section>
  );
}
