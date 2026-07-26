import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { AUDITED_ENGINES, EngineChip } from '../primitives/engine-chip';
import { Meta } from '../primitives/label';
import { Section } from '../primitives/section';
import { Reveal } from '../primitives/reveal';

/**
 * Coverage band. The claim is deliberately narrow: three engines we audit
 * today, named, with the reason the list is short stated in the same
 * breath. A logo wall of engines we do not cover would be the exact
 * fabrication the system forbids.
 */
export function EngineBand() {
  const { engines } = LANDING_CONTENT;
  return (
    <Section rhythm="tight" divided>
      <Reveal className="grid items-start gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <Meta as="p" className="mb-3">
            {engines.kicker}
          </Meta>
          <h2 className="font-mkt-display text-mkt-d4 text-mkt-ink max-w-[22ch] font-medium">
            {engines.title}
          </h2>
          <p className="text-mkt-body text-mkt-ink-soft mt-3 max-w-[62ch]">{engines.body}</p>
        </div>
        <div className="flex flex-wrap gap-2.5 lg:justify-end">
          {AUDITED_ENGINES.map((engine) => (
            <EngineChip key={engine} engine={engine} />
          ))}
        </div>
      </Reveal>
    </Section>
  );
}
