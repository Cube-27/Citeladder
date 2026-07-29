import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { Reveal, StaggerGroup, StaggerItem } from '../primitives/reveal';
import { Section, SectionHeader } from '../primitives/section';

/**
 * The "so how is this real" beat. Three steps — observe, verify, decide — set
 * as a tight strip with a connecting rule, not boxed cards. It answers the
 * scepticism the demo creates ("that was illustrative") by stating the
 * verification standard: persisted answers, versioned rules, reproducible
 * numbers.
 */
export function Proof() {
  const { proof } = LANDING_CONTENT;
  return (
    <Section id="how-it-works" tone="sunken" rhythm="loose" aria-labelledby="proof-title">
      <SectionHeader
        kicker={proof.kicker}
        title={proof.title}
        intro={proof.intro}
        headingId="proof-title"
      />
      <StaggerGroup className="grid gap-10 md:grid-cols-3">
        {proof.steps.map((step, index) => (
          <StaggerItem key={step.num} className="relative">
            {/* The connecting rule between steps — the run is a sequence. */}
            {index > 0 && (
              <span
                aria-hidden
                className="bg-mkt-line-soft absolute top-3 -left-5 hidden h-px w-10 md:block"
              />
            )}
            <p className="text-mkt-meta text-mkt-ink-muted font-mono uppercase">
              {step.num} / {step.kicker}
            </p>
            <h3 className="font-mkt-display text-mkt-ink text-mkt-d5 mt-3">{step.title}</h3>
            <p className="text-mkt-sm text-mkt-ink-soft mt-3 max-w-[36ch]">{step.body}</p>
          </StaggerItem>
        ))}
      </StaggerGroup>
      <Reveal className="mt-12">
        <p className="text-mkt-body text-mkt-ink border-mkt-line-soft max-w-[52ch] border-l-2 pl-5 font-semibold">
          {proof.standard}
        </p>
      </Reveal>
    </Section>
  );
}
