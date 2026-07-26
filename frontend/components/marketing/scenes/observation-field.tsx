import { ENGINES, type EngineKey } from '../primitives/engine-chip';
import { LiveDot, Meta } from '../primitives/label';
import { VerifiedMark } from '../primitives/badge';
import { ExampleDataNote, GlassPanel, SceneStrip, WallpaperPanel } from './wallpaper-panel';
import { cn } from '@/lib/utils';

/**
 * The hero scene: providers orbiting one observation, with the derived
 * position at the centre and the evidence trail along the bottom. It is the
 * whole product argument in one picture — many engines in, one traceable
 * conclusion out.
 *
 * Positions are on a 12-point clock rather than the deck's hand-tuned
 * percentages, so the nodes stay balanced at every width instead of drifting
 * into the centre card on mid-size viewports.
 */
const NODES: readonly { engine: EngineKey; at: string; delay: string }[] = [
  { engine: 'openai', at: 'top-[16%] left-[6%] md:left-[10%]', delay: '0s' },
  { engine: 'claude', at: 'top-[12%] right-[6%] md:right-[10%]', delay: '1.1s' },
  { engine: 'gemini', at: 'bottom-[28%] left-[4%] md:left-[12%]', delay: '2.2s' },
  { engine: 'perplexity', at: 'right-[4%] bottom-[26%] md:right-[10%]', delay: '0.5s' },
  { engine: 'grok', at: 'top-[46%] right-[4%] hidden lg:flex', delay: '1.6s' },
];

function ProviderNode({ engine, at, delay }: (typeof NODES)[number]) {
  const { label, dot } = ENGINES[engine];
  return (
    <span
      className={cn(
        'border-mkt-glass-line bg-mkt-glass text-mkt-slate text-mkt-sm rounded-mkt-sm',
        'animate-mkt-float absolute z-4 flex items-center gap-2 border px-3 py-2 backdrop-blur-md',
        'shadow-mkt-glass',
        at,
      )}
      style={{ animationDelay: delay }}
    >
      <i aria-hidden className={cn('size-1.75 shrink-0 rounded-full', dot)} />
      {label}
    </span>
  );
}

export function ObservationField() {
  return (
    <WallpaperPanel className="min-h-[36rem] md:min-h-[40rem]">
      {/* Faint field grid — gives the atmosphere a measured feel rather than
          a purely decorative gradient. */}
      <svg
        aria-hidden
        viewBox="0 0 1200 650"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full opacity-[0.18]"
      >
        <path
          d="M0 130H1200M0 260H1200M0 390H1200M0 520H1200M240 0V650M480 0V650M720 0V650M960 0V650"
          stroke="white"
          strokeWidth="1"
        />
      </svg>

      <SceneStrip>
        <Meta as="p" className="text-mkt-slate-soft">
          Market observation field / 05 providers
        </Meta>
        <LiveDot>Evidence capture active</LiveDot>
      </SceneStrip>

      {/* Everything below is illustrative: hidden from assistive tech, with
          the "Example data" mark left visible for sighted readers. */}
      <div
        aria-hidden
        className="relative z-2 grid min-h-[28rem] place-items-center px-5 py-10 md:min-h-[32rem] md:p-11"
      >
        <svg
          viewBox="0 0 860 440"
          className="absolute w-[min(88%,55rem)] overflow-visible"
          preserveAspectRatio="xMidYMid meet"
        >
          <ellipse className="mkt-orbit-line" cx="430" cy="220" rx="270" ry="125" />
          <ellipse
            className="mkt-orbit-line animate-mkt-travel"
            data-active
            cx="430"
            cy="220"
            rx="360"
            ry="178"
          />
          <path className="mkt-orbit-line" d="M62 220h736M430 28v384" />
        </svg>

        {NODES.map((node) => (
          <ProviderNode key={node.engine} {...node} />
        ))}

        <GlassPanel className="relative z-3 w-full max-w-[20.5rem] p-6">
          <div className="mb-8 flex items-center justify-between gap-3">
            <strong className="text-mkt-sm text-mkt-ink">Category position</strong>
            <VerifiedMark />
          </div>
          <div className="flex items-end gap-2.5">
            <b className="text-mkt-ink mkt-num text-[4.5rem] leading-none font-medium tracking-[-0.07em]">
              72
            </b>
            <span className="text-mkt-meta text-mkt-slate-soft mb-2 uppercase">
              visibility
              <br />
              index
            </span>
          </div>
          <div className="bg-mkt-glass-line my-5 h-px" />
          <div className="grid grid-cols-2 gap-3">
            <span className="text-mkt-meta text-mkt-slate-soft uppercase">
              Answers observed
              <b className="text-mkt-ink mkt-num text-mkt-sm mt-1.5 block font-medium">1,248</b>
            </span>
            <span className="text-mkt-meta text-mkt-slate-soft uppercase">
              Citations traced
              <b className="text-mkt-ink mkt-num text-mkt-sm mt-1.5 block font-medium">3,091</b>
            </span>
          </div>
        </GlassPanel>
      </div>

      <div className="absolute inset-x-4 bottom-4 z-5 sm:inset-x-6 sm:bottom-6">
        <GlassPanel className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3.5 sm:px-5">
          <p aria-hidden className="text-mkt-slate text-mkt-sm min-w-0 flex-1 truncate italic">
            “Which platforms provide verifiable AI visibility?”
          </p>
          <span aria-hidden className="text-mkt-meta text-mkt-slate-soft hidden uppercase lg:block">
            Source artifact
            <b className="text-mkt-slate mkt-num text-mkt-sm mt-1 block font-medium">AR-09F3C21E</b>
          </span>
          <span aria-hidden className="text-mkt-meta text-mkt-slate-soft hidden uppercase lg:block">
            Rule version
            <b className="text-mkt-slate mkt-num text-mkt-sm mt-1 block font-medium">
              MENTION / V4.2
            </b>
          </span>
          <ExampleDataNote />
        </GlassPanel>
      </div>
    </WallpaperPanel>
  );
}
