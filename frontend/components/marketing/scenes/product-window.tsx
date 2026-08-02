'use client';

import { useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import {
  BarChart3,
  Bot,
  Eye,
  FileSearch,
  Search,
  ShieldCheck,
  Zap,
  TrendingUp,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { ICONS } from '@/lib/icons';
import { useTourAutoplay } from '@/lib/hooks/use-tour-autoplay';
import { Meta } from '../primitives/label';
import { TourStepper } from '../primitives/tour-stepper';
import { ExampleDataNote } from './wallpaper-panel';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * Animated number component powered by GSAP ScrollTrigger.
 */
function AnimatedNumber({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [displayValue, setDisplayValue] = useState(value);
  const reduceMotion = useReducedMotion();

  useGSAP(
    () => {
      const numericTarget = parseFloat(value.replace(/,/g, ''));
      if (isNaN(numericTarget) || reduceMotion) {
        setDisplayValue(value);
        return;
      }

      const obj = { val: 0 };
      const isDecimal = value.includes('.');
      const isComma = value.includes(',');

      gsap.to(obj, {
        val: numericTarget,
        duration: 1.8,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: ref.current,
          start: 'top 85%',
          once: true,
        },
        onUpdate: () => {
          if (isDecimal) {
            setDisplayValue(obj.val.toFixed(1));
          } else if (isComma) {
            setDisplayValue(Math.floor(obj.val).toLocaleString('en-US'));
          } else {
            setDisplayValue(Math.floor(obj.val).toString());
          }
        },
      });
    },
    { scope: ref, dependencies: [value, reduceMotion] },
  );

  return <span ref={ref}>{displayValue}</span>;
}

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const STEP_DURATION = 6000;

// Compact relevant sidebar items to reduce overall height
const COMPACT_NAV_GROUPS = [
  {
    title: 'Analyze',
    items: [
      { label: 'Visibility', icon: ICONS.visibility },
      { label: 'AI Referrals', icon: ICONS.analytics },
      { label: 'Traffic', icon: ICONS.traffic },
      { label: 'Prompts', icon: ICONS.prompts },
    ],
  },
  {
    title: 'Improve',
    items: [
      { label: 'Content', icon: ICONS.content },
      { label: 'Site health', icon: ICONS.siteHealth },
      { label: 'Opportunities', icon: ICONS.opportunities },
    ],
  },
] as const;

const STORY_STEPS = [
  {
    id: 'observe',
    num: '01',
    label: '1. Observe',
    navLabel: 'Visibility',
    shiftTitle: 'Shift Fact #1: Buyers ask AI before browsing',
    productSolution:
      'Track real buyer prompts across ChatGPT, Gemini, Claude & Perplexity with trend graphs',
    icon: Eye,
  },
  {
    id: 'trace',
    num: '02',
    label: '2. Trace',
    navLabel: 'AI Referrals',
    shiftTitle: 'Shift Fact #2: AI answers cite, they don’t rank',
    productSolution:
      'Trace every score back to exact LLM answer text & 100% reproducible source citations',
    icon: FileSearch,
  },
  {
    id: 'benchmark',
    num: '03',
    label: '3. Benchmark',
    navLabel: 'Prompts',
    shiftTitle: 'Shift Fact #3: You can’t fix what you can’t see',
    productSolution:
      'Benchmark your brand’s Share of Voice & citation graphs against market competitors',
    icon: BarChart3,
  },
  {
    id: 'optimize',
    num: '04',
    label: '4. Optimize',
    navLabel: 'Opportunities',
    shiftTitle: 'Navigating The Shift',
    // "high-ROI" asserts an outcome nothing here measures. The prioritisation
    // is real and deterministic; the return on it is not ours to claim.
    productSolution: 'Turn visibility gaps into prioritized content & schema updates',
    icon: Zap,
  },
] as const;

interface MetricItem {
  label: string;
  value: string;
  delta?: string;
}

const METRICS: readonly MetricItem[] = [
  { label: 'Visibility index', value: '72.4', delta: '+4.8' },
  { label: 'Share of voice', value: '18.6', delta: '+2.1' },
  { label: 'Answers observed', value: '1,248' },
];

const EVIDENCE = {
  answer:
    '“For enterprise analytics, teams most often cite Searchify alongside market leaders for its verifiable citation tracking…”',
  chain: [
    ['Provider', 'ChatGPT 4.5'],
    ['Artifact', 'a3f9c1'],
    ['Analyzer', 'visibility-v4.2'],
    ['Reproducible', 'yes'],
  ],
} as const;

/**
 * Compact, Authentic Searchify Product Showcase Canvas with Real Trend Graphs.
 * Fits comfortably on screen with streamlined sidebar, real-time SVG charts,
 * and a narrative tour connecting "The Shift" to "How Searchify Helps You Win".
 */
const GRID_COLS_MAP: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

// react-doctor-disable-next-line react-doctor/no-giant-component -- one synchronized GSAP/stepper scene owns all four mutually exclusive frames and their shared transition state.
export function ProductWindow() {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { activeStep, isPlaying, selectStep, togglePlay } = useTourAutoplay(
    STORY_STEPS.length,
    STEP_DURATION,
  );

  const currentStep = STORY_STEPS[activeStep];

  return (
    <div ref={containerRef} className="mkt-snapshot p-mkt-14 sm:p-mkt-20 mx-auto max-w-5xl">
      {/* Storytelling Tour Stepper */}
      <div className="bg-mkt-surface-sunk border-mkt-black-10 mb-mkt-20 rounded-mkt-lg p-mkt-14 sm:p-mkt-14 border">
        <div className="gap-mkt-10 flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <TourStepper
            steps={STORY_STEPS}
            activeStep={activeStep}
            isPlaying={isPlaying}
            onSelectStep={selectStep}
            onTogglePlay={togglePlay}
            compact
          />
          <div className="hidden sm:block">
            <ExampleDataNote />
          </div>
        </div>

        <div className="border-mkt-black-10/60 text-mkt-xs mt-mkt-14 pt-mkt-10 flex items-center justify-between border-t">
          <div className="gap-mkt-10 flex items-center truncate">
            <span className="bg-mkt-success size-1.5 shrink-0 animate-pulse rounded-full" />
            <span className="text-mkt-indigo font-mono font-semibold uppercase">
              {currentStep.label.split('.')[1]?.trim()}:
            </span>
            <span className="text-mkt-ink-soft truncate font-medium">
              {currentStep.productSolution} — every score opens to the answer behind it.
            </span>
          </div>
          <div className="ml-mkt-10 shrink-0 sm:hidden">
            <ExampleDataNote />
          </div>
        </div>
      </div>

      {/* Compact Product Layout Canvas */}
      <div
        aria-hidden
        className="mkt-snapshot-canvas bg-mkt-surface-sunk grid min-h-[280px] items-stretch gap-0 overflow-hidden lg:grid-cols-[12rem_minmax(0,1fr)]"
      >
        {/* Streamlined Authentic Sidebar */}
        <aside className="bg-mkt-surface border-mkt-black-10 p-mkt-14 hidden flex-col justify-between border-r lg:flex">
          <div className="space-y-mkt-20">
            {COMPACT_NAV_GROUPS.map((group) => (
              <div key={group.title} className="space-y-mkt-6">
                <p className="text-mkt-xs text-mkt-ink-soft mb-mkt-6 px-mkt-10 font-mono font-semibold uppercase">
                  {group.title}
                </p>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.label === currentStep.navLabel;

                  return (
                    <div
                      key={item.label}
                      className={`text-mkt-xs gap-mkt-10 rounded-mkt-sm px-mkt-10 py-mkt-6 relative flex items-center font-medium transition-colors ${
                        isActive
                          ? 'bg-mkt-frost text-mkt-indigo font-semibold'
                          : 'text-mkt-ink-soft'
                      }`}
                    >
                      {isActive && (
                        <span className="bg-mkt-indigo rounded-r-mkt-sm absolute top-1 bottom-1 left-0 w-0.5" />
                      )}
                      <Icon className="size-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>

        {/* Compact Main Workspace Area with Real Graphs */}
        <div className="bg-mkt-surface p-mkt-20 sm:p-mkt-20 flex flex-col justify-between">
          <AnimatePresence mode="wait">
            {activeStep === 0 && (
              <m.div
                key="observe-view"
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
                className="space-y-mkt-20"
              >
                <div className="flex items-center justify-between">
                  <p className="font-mkt-display text-mkt-sm text-mkt-ink font-semibold">
                    Visibility Overview & Trend Graph
                  </p>
                  <span className="text-mkt-xs text-mkt-indigo gap-mkt-6 flex items-center font-mono font-semibold">
                    <TrendingUp className="size-3" /> Cross-Run Trend
                  </span>
                </div>

                {/* Metrics Row */}
                <div
                  className={cn(
                    'border-mkt-black-10 bg-mkt-surface rounded-mkt-sm grid border',
                    GRID_COLS_MAP[METRICS.length] ?? 'grid-cols-3',
                  )}
                >
                  {METRICS.map((metric, index) => (
                    <div
                      key={metric.label}
                      className={`p-mkt-14 sm:p-mkt-14 ${
                        index < METRICS.length - 1 ? 'border-mkt-black-10 border-r' : ''
                      }`}
                    >
                      <Meta as="p" className="text-mkt-xs text-mkt-ink-soft">
                        {metric.label}
                      </Meta>
                      <b className="text-mkt-body text-mkt-ink mt-mkt-6 block font-mono leading-none font-semibold tabular-nums">
                        <AnimatedNumber value={metric.value} />
                        {'delta' in metric && metric.delta && (
                          <small className="text-mkt-xs text-mkt-success-text ml-mkt-6 font-mono font-semibold tabular-nums">
                            {metric.delta}
                          </small>
                        )}
                      </b>
                    </div>
                  ))}
                </div>

                {/* SVG Trend Graph (Real Product Chart) */}
                <div className="bg-mkt-surface-sunk border-mkt-black-10 rounded-mkt-sm p-mkt-14 border">
                  <div className="text-mkt-xs text-mkt-ink-soft mb-mkt-10 flex items-center justify-between font-mono">
                    <span>Visibility Score Trend (Last 8 Audits)</span>
                    <span className="text-mkt-success-text font-semibold">72.4% Peak</span>
                  </div>
                  <div className="pt-mkt-10 relative flex h-20 w-full items-end">
                    {/* SVG Curve Line */}
                    <svg
                      className="h-full w-full overflow-visible"
                      viewBox="0 0 300 60"
                      preserveAspectRatio="none"
                    >
                      <defs>
                        <linearGradient id="visibilityGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop
                            offset="0%"
                            stopColor="var(--color-mkt-indigo)"
                            stopOpacity="0.25"
                          />
                          <stop
                            offset="100%"
                            stopColor="var(--color-mkt-indigo)"
                            stopOpacity="0.0"
                          />
                        </linearGradient>
                      </defs>
                      <path
                        d="M 0,45 Q 40,38 80,32 T 160,22 T 240,15 T 300,8 L 300,60 L 0,60 Z"
                        fill="url(#visibilityGradient)"
                      />
                      <path
                        d="M 0,45 Q 40,38 80,32 T 160,22 T 240,15 T 300,8"
                        fill="none"
                        stroke="var(--color-mkt-indigo)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      <circle cx="300" cy="8" r="3.5" fill="var(--color-mkt-indigo)" />
                    </svg>
                  </div>
                  <div className="text-mkt-xs text-mkt-ink-soft border-mkt-black-10 mt-mkt-6 pt-mkt-6 flex justify-between border-t font-mono">
                    <span>Apr 01</span>
                    <span>May 15</span>
                    <span>Jun 30 (Latest Run)</span>
                  </div>
                </div>
              </m.div>
            )}

            {activeStep === 1 && (
              <m.div
                key="trace-view"
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
                className="space-y-mkt-14"
              >
                <div className="flex items-center justify-between">
                  <p className="font-mkt-display text-mkt-sm text-mkt-ink font-semibold">
                    Answers & Evidence Trace
                  </p>
                  <span className="text-mkt-xs text-mkt-indigo gap-mkt-6 flex items-center font-mono font-semibold">
                    <ShieldCheck className="text-mkt-success-text size-3" /> 100% Verifiable
                  </span>
                </div>

                <div className="bg-mkt-surface-sunk border-mkt-black-10 rounded-mkt-sm p-mkt-14 border">
                  <div className="text-mkt-xs text-mkt-ink-soft flex items-center justify-between">
                    <span className="text-mkt-ink gap-mkt-6 flex items-center font-semibold">
                      <Search className="text-mkt-indigo size-3" />
                      Observed Answer Text
                    </span>
                    <span className="text-mkt-indigo font-mono font-semibold tabular-nums">
                      Visibility score: <AnimatedNumber value="72.4" />
                    </span>
                  </div>

                  <p className="text-mkt-xs text-mkt-ink mt-mkt-10 leading-relaxed font-medium">
                    {EVIDENCE.answer}
                  </p>

                  <div className="mt-mkt-14 gap-mkt-6 flex flex-wrap">
                    {EVIDENCE.chain.map(([label, value]) => (
                      <span
                        key={label}
                        className="text-mkt-xs bg-mkt-surface border-mkt-black-10 text-mkt-success-text px-mkt-10 py-mkt-6 rounded-full border font-mono"
                      >
                        <span className="text-mkt-ink-soft uppercase">{label}:</span>{' '}
                        <span className="font-semibold">{value}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </m.div>
            )}

            {activeStep === 2 && (
              <m.div
                key="benchmark-view"
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
                className="space-y-mkt-14"
              >
                <div className="flex items-center justify-between">
                  <p className="font-mkt-display text-mkt-sm text-mkt-ink font-semibold">
                    Share of Voice & Competitive Chart
                  </p>
                  <span className="text-mkt-xs text-mkt-indigo font-mono font-semibold">
                    Market Share Comparison
                  </span>
                </div>

                <div className="bg-mkt-surface-sunk border-mkt-black-10 space-y-mkt-14 rounded-mkt-sm p-mkt-14 border">
                  <div>
                    <div className="text-mkt-xs mb-mkt-6 flex justify-between font-semibold">
                      <span className="text-mkt-ink">Acme Corp (Your Brand)</span>
                      <span className="text-mkt-indigo font-mono">38.4% Share (#1 Lead)</span>
                    </div>
                    <div className="bg-mkt-black-10 h-2 w-full overflow-hidden rounded-full">
                      <div className="bg-mkt-indigo h-full w-[38.4%] rounded-full" />
                    </div>
                  </div>

                  <div>
                    <div className="text-mkt-xs text-mkt-ink-soft mb-mkt-6 flex justify-between">
                      <span>Competitor A</span>
                      <span className="font-mono">28.1%</span>
                    </div>
                    <div className="bg-mkt-black-10 h-2 w-full overflow-hidden rounded-full">
                      <div className="bg-mkt-mist h-full w-[28.1%] rounded-full opacity-60" />
                    </div>
                  </div>

                  <div>
                    <div className="text-mkt-xs text-mkt-ink-soft mb-mkt-6 flex justify-between">
                      <span>Competitor B</span>
                      <span className="font-mono">19.5%</span>
                    </div>
                    <div className="bg-mkt-black-10 h-2 w-full overflow-hidden rounded-full">
                      <div className="bg-mkt-mist h-full w-[19.5%] rounded-full opacity-40" />
                    </div>
                  </div>
                </div>
              </m.div>
            )}

            {activeStep === 3 && (
              <m.div
                key="optimize-view"
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
                className="space-y-mkt-14"
              >
                <div className="flex items-center justify-between">
                  <p className="font-mkt-display text-mkt-sm text-mkt-ink font-semibold">
                    Opportunities & Action Recommendations
                  </p>
                  <span className="text-mkt-xs text-mkt-indigo font-mono font-semibold">
                    High-Impact Moves
                  </span>
                </div>

                <div className="bg-mkt-surface-sunk border-mkt-black-10 rounded-mkt-sm p-mkt-14 flex items-center justify-between border">
                  <div className="gap-mkt-10 flex items-center">
                    <span className="bg-mkt-warning/10 text-mkt-warning-text border-mkt-warning/50 rounded-mkt-sm p-mkt-6 border">
                      <Zap className="size-3" />
                    </span>
                    <div>
                      <span className="text-mkt-xs text-mkt-ink block font-semibold">
                        Update Deprecated Docs Cited by ChatGPT
                      </span>
                      <span className="text-mkt-xs text-mkt-ink-soft">
                        Increases ChatGPT recommendation score by +14%
                      </span>
                    </div>
                  </div>
                  <span className="text-mkt-xs bg-mkt-indigo rounded-mkt-sm px-mkt-10 py-mkt-6 font-semibold text-white">
                    Fix Now
                  </span>
                </div>

                <div className="bg-mkt-surface-sunk border-mkt-black-10 rounded-mkt-sm p-mkt-14 flex items-center justify-between border">
                  <div className="gap-mkt-10 flex items-center">
                    <span className="bg-mkt-frost text-mkt-indigo border-mkt-primary/50 rounded-mkt-sm p-mkt-6 border">
                      <Bot className="size-3" />
                    </span>
                    <div>
                      <span className="text-mkt-xs text-mkt-ink block font-semibold">
                        Publish Enterprise Comparison Table for Gemini
                      </span>
                      <span className="text-mkt-xs text-mkt-ink-soft">
                        Captures missing citations in enterprise buyer queries
                      </span>
                    </div>
                  </div>
                  <span className="text-mkt-xs bg-mkt-surface border-mkt-black-10 text-mkt-ink rounded-mkt-sm px-mkt-10 py-mkt-6 border font-semibold">
                    View Draft
                  </span>
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
