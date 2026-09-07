import { LANDING_CONTENT } from '@/lib/marketing-content/landing';
import { cn } from '@/lib/utils';

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
      <SectionHeader title={reveal.title} lead={reveal.lead} headingId="reveal-title" />
      <StaggerGroup className="grid gap-6 lg:grid-cols-12">
        {reveal.questions.map((question, index) => {
          const Icon = LANDING_ICONS[question.icon];
          const isFeatured = index === 0;
          return (
            <StaggerItem
              key={question.title}
              className={cn(
                'h-full',
                isFeatured ? 'lg:col-span-12 xl:col-span-6' : 'lg:col-span-6 xl:col-span-3',
              )}
            >
              <article
                className={cn(
                  'border-border-subtle/80 flex h-full flex-col justify-between rounded-[var(--radius-card)] border p-6 sm:p-7 transition-colors duration-200',
                  isFeatured
                    ? 'bg-panel/80 hover:bg-panel sm:p-8'
                    : 'bg-panel/40 hover:bg-panel/70',
                )}
              >
                <div>
                  <span
                    className={`flex size-12 items-center justify-center rounded-[var(--radius-card)] ${LANDING_TILES[question.tile]}`}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="website-small-heading text-foreground mt-5">{question.title}</h3>
                  <p className="website-body text-muted mt-2.5 max-w-[44ch]">{question.body}</p>
                </div>
                {isFeatured ? (
                  <div
                    aria-hidden
                    className="border-border-subtle/60 bg-background-alt/60 text-muted mt-6 flex items-center gap-3 rounded-[var(--radius-control)] border px-3.5 py-2.5 text-xs"
                  >
                    <span className="bg-accent size-2 rounded-full" />
                    <span className="font-mono text-xs">
                      Tracking ChatGPT · Gemini · Claude · Perplexity
                    </span>
                  </div>
                ) : null}
              </article>
            </StaggerItem>
          );
        })}
      </StaggerGroup>
    </Section>
  );
}
