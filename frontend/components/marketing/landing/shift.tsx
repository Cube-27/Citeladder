import { BadgeCheck, Eye, Quote } from 'lucide-react';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { StaggerGroup, StaggerItem } from '../primitives/reveal';
import { Section, SectionHeader } from '../primitives/section';

const QUESTION_ICONS = {
  'Are you named?': Eye,
  'What gets cited?': Quote,
  'Can your site prove it?': BadgeCheck,
} as const;

export function Shift() {
  const { reveal } = LANDING_CONTENT;
  return (
    <Section id="why" tone="sunken" rhythm="base" aria-labelledby="reveal-title">
      <SectionHeader title={reveal.title} lead={reveal.lead} headingId="reveal-title" />
      <StaggerGroup className="grid gap-6 lg:grid-cols-3">
        {reveal.questions.map((question, index) => {
          const Icon = QUESTION_ICONS[question.title];
          return (
            <StaggerItem key={question.title}>
              <article className="border-border-subtle grid gap-3 border-t pt-4">
                <Icon className="text-accent size-5" aria-hidden />
                <h3 className="website-small-heading">{question.title}</h3>
                <p className="website-body max-w-[44ch]">{question.body}</p>
                {index === 0 ? (
                  <p className="website-label">Tracking ChatGPT · Gemini · Claude · Perplexity</p>
                ) : null}
              </article>
            </StaggerItem>
          );
        })}
      </StaggerGroup>
    </Section>
  );
}
