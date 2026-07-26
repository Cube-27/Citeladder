import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { Badge } from '../primitives/badge';
import { Meta } from '../primitives/label';
import { Section, SectionHeader } from '../primitives/section';
import { Reveal } from '../primitives/reveal';
import { ExampleDataNote } from '../scenes/wallpaper-panel';

/**
 * The evidence chapter: what a traced result actually looks like. A table of
 * observed answers beside the score they roll up into — the two halves of the
 * product's central claim, shown together so the link between them is the
 * point rather than a footnote.
 *
 * Illustrative rows, so the table is aria-hidden and marked as example data.
 * The section's real argument lives in the heading and the note under the
 * score, which are readable by everyone.
 */
const ROWS = [
  ['Best analytics platforms for enterprise teams', 'ChatGPT', '09F3C21E', 'Mentioned', 'good'],
  ['How to measure brand visibility in AI answers', 'Claude', '1A64D0BC', 'Cited', 'proof'],
  ['Searchify alternatives for global agencies', 'Gemini', '3E92BA71', 'Review', 'warn'],
] as const;

const CELL =
  'grid grid-cols-[minmax(0,1.6fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-4 lg:grid-cols-[minmax(0,1.5fr)_0.8fr_0.7fr_auto]';

export function Evidence() {
  const { evidence } = LANDING_CONTENT;
  return (
    <Section id="evidence" rhythm="loose" divided aria-labelledby="evidence-title">
      <SectionHeader
        index={evidence.index}
        kicker={evidence.kicker}
        title={evidence.title}
        intro={evidence.intro}
        headingId="evidence-title"
      />

      <Reveal className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="border-mkt-line rounded-mkt-lg bg-mkt-surface overflow-hidden border">
          <div className={`${CELL} bg-mkt-paper-raised border-mkt-line border-b`}>
            <Meta>Observed answer</Meta>
            <Meta className="hidden lg:block">Provider</Meta>
            <Meta className="hidden lg:block">Artifact</Meta>
            <ExampleDataNote className="justify-self-end" />
          </div>
          {ROWS.map(([answer, provider, artifact, finding, tone]) => (
            <div
              aria-hidden
              key={artifact}
              className={`${CELL} border-mkt-line text-mkt-sm border-b last:border-b-0`}
            >
              <strong className="text-mkt-ink font-semibold">{answer}</strong>
              <span className="text-mkt-ink-soft hidden lg:block">{provider}</span>
              <Meta className="hidden lg:block">{artifact}</Meta>
              <Badge tone={tone} className="justify-self-end">
                {finding}
              </Badge>
            </div>
          ))}
        </div>

        <div className="border-mkt-line rounded-mkt-lg bg-mkt-surface flex flex-col border p-7">
          <div className="flex items-center justify-between gap-3">
            <Meta>Visibility index</Meta>
            <Meta>Formula v4.2</Meta>
          </div>
          <p
            aria-hidden
            className="text-mkt-ink mkt-num my-10 text-[4.75rem] leading-none font-medium tracking-[-0.07em]"
          >
            72.4 <small className="text-mkt-ink-muted text-mkt-meta font-normal">/ 100</small>
          </p>
          <div aria-hidden className="grid grid-cols-[72fr_28fr] gap-1">
            <i className="bg-mkt-proof block h-1.5 rounded-full" />
            <i className="bg-mkt-surface-sunk block h-1.5 rounded-full" />
          </div>
          <p className="text-mkt-sm text-mkt-ink-soft mt-5">
            Computed from persisted answers, never from a model’s opinion of another model. Open the
            score to inspect every contributing artifact.
          </p>
        </div>
      </Reveal>
    </Section>
  );
}
