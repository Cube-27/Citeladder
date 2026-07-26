import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { ALL_ENGINES, EngineChip } from '../primitives/engine-chip';
import { Meta } from '../primitives/label';
import { Section } from '../primitives/section';
import { Reveal } from '../primitives/reveal';

/**
 * Coverage band. The moving roster lives in the hero; this band is the static,
 * readable statement of the same fact — the full provider list beside the
 * sentence that explains what "coverage" actually means here.
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
          <h2 className="font-mkt-display text-mkt-d4 text-mkt-ink mkt-display-w max-w-[22ch]">
            {engines.title}
          </h2>
          <p className="text-mkt-body text-mkt-ink-soft mt-3 max-w-[62ch]">{engines.body}</p>
        </div>
        <div className="flex flex-wrap gap-2.5 lg:justify-end">
          {ALL_ENGINES.map((engine) => (
            <EngineChip key={engine} engine={engine} />
          ))}
        </div>
      </Reveal>
    </Section>
  );
}
