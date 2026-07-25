import { ArrowRight } from 'lucide-react';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { Reveal, StaggerGroup, StaggerItem } from './motion-primitives';

const SHIFTS = [
  ['Ten blue links', 'One synthesized answer'],
  ['Keyword position', 'Cited recommendations'],
  ['Traffic without context', 'Evidence you can inspect'],
] as const;

/** A restrained editorial bridge from the hero promise into the workflow. */
export function EditorialShift() {
  const { shift } = LANDING_CONTENT;
  // The headline is owned by the content model; the accent treatment on its
  // final word is presentation, so it is split off here rather than the
  // sentence being restated in the component.
  const split = shift.title.lastIndexOf(' ') + 1;
  const lead = shift.title.slice(0, split);
  const accent = shift.title.slice(split);
  return (
    <section className="signal-shift" id="shift" aria-labelledby="shift-title">
      <div className="container shift-layout">
        <Reveal className="shift-copy">
          <span className="eyebrow">{shift.eyebrow}</span>
          <h2 id="shift-title">
            {lead}
            <span className="serif-accent grad-text">{accent}</span>
          </h2>
          <p>{shift.body}</p>
        </Reveal>
        <StaggerGroup className="shift-list">
          {SHIFTS.map(([from, to]) => (
            <StaggerItem className="shift-row" key={from}>
              {/* <s> rather than a line-through span: the strike is the meaning
                  (this is the retired model), not decoration. */}
              <s>{from}</s>
              <ArrowRight aria-hidden />
              <strong>{to}</strong>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}
