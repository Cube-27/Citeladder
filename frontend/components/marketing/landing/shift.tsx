import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { StaggerGroup, StaggerItem } from '../primitives/reveal';
import { Section, SectionHeader } from '../primitives/section';
import { LANDING_ICONS, LANDING_TILES } from './landing-icons';

/**
 * "What CiteLadder reveals" — one record, three questions. The pastel icon
 * tile leads each column, so the colour carriers read first and the questions
 * stay one quiet ledger.
 */
export function Shift() {
  const { reveal } = LANDING_CONTENT;
  // Sunken, not paper: SeeIt below is the product's paper band, and the seam
  // rule would otherwise collapse the gap between two same-tone neighbours
  // until the questions and the product read as one block.
  return (
    <Section id="why" tone="sunken" rhythm="base" aria-labelledby="reveal-title">
      <SectionHeader
        eyebrow={reveal.kicker}
        title={reveal.title}
        lead={reveal.lead}
        headingId="reveal-title"
      />
      <StaggerGroup className="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {reveal.questions.map((question) => {
          const Icon = LANDING_ICONS[question.icon];
          return (
            <StaggerItem key={question.title} className="h-full">
              <article className="flex h-full flex-col">
                <span
                  className={`flex size-12 items-center justify-center rounded-[var(--radius-card)] ${LANDING_TILES[question.tile]}`}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="website-small-heading text-foreground mt-5">{question.title}</h3>
                <p className="website-body text-muted mt-2 max-w-[44ch]">{question.body}</p>
              </article>
            </StaggerItem>
          );
        })}
      </StaggerGroup>
    </Section>
  );
}
