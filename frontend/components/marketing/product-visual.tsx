import { ArrowRight } from 'lucide-react';

import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { Reveal, StaggerGroup, StaggerItem } from './motion-primitives';

const SHIFTS = [
  ['Ten blue links', 'One synthesized answer'],
  ['Keyword position', 'Cited recommendations'],
  ['Traffic without context', 'Evidence you can inspect'],
] as const;

/** A restrained editorial bridge from the hero promise into the workflow. */
export function ProductVisual() {
  const { shift } = LANDING_CONTENT;
  return (
    <section className="signal-shift" id="product" aria-labelledby="shift-title">
      <div className="container shift-layout">
        <Reveal className="shift-copy">
          <span className="eyebrow">{shift.eyebrow}</span>
          <h2 id="shift-title">
            The first page of search is now a{' '}
            <span className="serif-accent grad-text">conversation.</span>
          </h2>
          <p>{shift.body}</p>
        </Reveal>
        <StaggerGroup className="shift-list">
          {SHIFTS.map(([from, to]) => (
            <StaggerItem className="shift-row" key={from}>
              <span>{from}</span>
              <ArrowRight aria-hidden />
              <strong>{to}</strong>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}
