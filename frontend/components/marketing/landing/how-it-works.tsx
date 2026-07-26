import { LANDING_CONTENT } from '@/lib/marketing-content/landing';

import { Meta } from '../primitives/label';
import { Section, SectionHeader } from '../primitives/section';
import { StaggerGroup, StaggerItem } from '../primitives/reveal';
import { ExampleDataNote, WallpaperPanel } from '../scenes/wallpaper-panel';
import { RotatingEngineLabel } from './rotating-engine-label';

/**
 * Observe → Verify → Decide, each step carrying a small scene that shows what
 * the step actually does. The scenes are the deck's motion demos, kept
 * because they explain causality — a run is a sequence, and a static three-up
 * of text would lose that.
 */
const SCENES = {
  /** Answers arriving from one engine after another, sentence held still. */
  observe: (
    <div className="text-mkt-slate text-mkt-d4 flex min-h-[8rem] items-center">
      <span>Measure</span>
      <span className="border-mkt-slate/40 text-mkt-accent-display ml-2 inline-block min-w-[7.5rem] border-b pb-0.5">
        <RotatingEngineLabel />
      </span>
    </div>
  ),
  /** A record settling into place — 24px of travel, then stillness. */
  verify: (
    <div className="relative min-h-[8rem]">
      <span className="bg-mkt-glass-line absolute inset-x-0 bottom-0 h-px" />
      <div className="border-mkt-glass-line bg-mkt-glass shadow-mkt-glass rounded-mkt-sm absolute bottom-4 left-1/2 w-36 -translate-x-1/2 border p-4">
        <i className="bg-mkt-slate-soft mb-2 block h-1 w-3/5 rounded-full" />
        <i className="bg-mkt-glass-line block h-1 w-5/6 rounded-full" />
      </div>
    </div>
  ),
  /** Rows verifying in sequence — the choreography that explains scoring. */
  decide: (
    <div className="grid min-h-[8rem] content-center gap-2">
      {['Found', 'Traced', 'Scored'].map((label, index) => (
        <div
          key={label}
          style={{ animationDelay: `${index * 0.8}s` }}
          className="border-mkt-glass-line bg-mkt-glass-soft animate-mkt-verify rounded-mkt-xs grid grid-cols-[1fr_auto] items-center gap-3 border px-2.5 py-2.5"
        >
          <span className="bg-mkt-slate-soft/70 h-1 rounded-full" />
          <b className="text-mkt-meta text-mkt-evidence-text uppercase">{label}</b>
        </div>
      ))}
    </div>
  ),
} as const;

const SCENE_ORDER = ['observe', 'verify', 'decide'] as const;

export function HowItWorks() {
  const { howItWorks } = LANDING_CONTENT;
  return (
    <Section id="how-it-works" rhythm="loose" divided aria-labelledby="how-it-works-title">
      <SectionHeader
        index={howItWorks.index}
        kicker={howItWorks.kicker}
        title={howItWorks.title}
        intro={howItWorks.intro}
        headingId="how-it-works-title"
      />

      {/* Every wallpaper panel insets its glass window, so the atmosphere is
          visible on all four sides. Letting a full-bleed child cover it is
          what turned this scene into a flat blue band. */}
      <WallpaperPanel className="p-4 sm:p-8 lg:p-10">
        <div className="mb-3.5 flex items-center justify-between gap-3">
          <Meta as="p" className="text-mkt-slate-soft">
            One run / three stages
          </Meta>
          <ExampleDataNote />
        </div>
        <StaggerGroup className="border-mkt-glass-line bg-mkt-glass rounded-mkt-md grid overflow-hidden border backdrop-blur-lg md:grid-cols-3">
          {howItWorks.steps.map((step, index) => (
            <StaggerItem
              key={step.num}
              className="border-mkt-glass-line flex flex-col border-b p-6 last:border-b-0 md:border-r md:border-b-0 md:last:border-r-0"
            >
              <Meta as="p" className="text-mkt-slate-soft">
                {step.num} / {step.kicker}
              </Meta>
              <h3 className="font-mkt-display text-mkt-ink mt-3 mb-1.5 text-[1.0625rem] font-semibold tracking-[-0.03em]">
                {step.title}
              </h3>
              <p className="text-mkt-sm text-mkt-slate">{step.body}</p>
              {/* mt-auto pins every scene to the same baseline, so unequal
                  copy lengths do not stagger the illustrations. */}
              <div aria-hidden className="mt-auto pt-8">
                {SCENES[SCENE_ORDER[index]]}
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </WallpaperPanel>
    </Section>
  );
}
