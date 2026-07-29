'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  BarChart3,
  Bot,
  CheckCircle2,
  Eye,
  FileSearch,
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';

import { useTourAutoplay } from '@/lib/hooks/use-tour-autoplay';
import { EngineLogo } from '../primitives/engine-logo';
import { TourStepper } from '../primitives/tour-stepper';
import { ExampleDataNote } from '../scenes/wallpaper-panel';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const TOUR_STEPS = [
  {
    id: 'matrix',
    num: '01',
    label: 'Engine Matrix',
    title: 'Real-Time AI Observation',
    badge: 'Live Observation',
    icon: Eye,
    highlight: 'Continuous tracking across ChatGPT, Gemini, Claude & Perplexity',
  },
  {
    id: 'citation',
    num: '02',
    label: 'Evidence Trace',
    title: 'Verifiable Answer Verification',
    badge: '1-Click Audit',
    icon: FileSearch,
    highlight: 'Every metric links directly to the raw LLM output & source document',
  },
  {
    id: 'sov',
    num: '03',
    label: 'Share of Voice',
    title: 'Market Share & Sentiment',
    badge: 'Brand Intelligence',
    icon: BarChart3,
    highlight: 'Compare brand mentions, sentiment & citation share against competitors',
  },
  {
    id: 'actions',
    num: '04',
    label: 'AI Strategy Plan',
    title: 'Automated Recommendations',
    badge: 'High Impact Moves',
    icon: Zap,
    highlight: 'Prioritized content and schema updates to win top AI recommendations',
  },
] as const;

const ENGINES_DATA = [
  {
    key: 'openai' as const,
    name: 'ChatGPT 4.5',
    visibility: '88%',
    status: 'Cited in 84% queries',
    delta: '+5.2%',
    type: 'cited',
  },
  {
    key: 'claude' as const,
    name: 'Claude 3.5 Sonnet',
    visibility: '92%',
    status: 'Top Recommended',
    delta: '+6.1%',
    type: 'named',
  },
  {
    key: 'gemini' as const,
    name: 'Google Gemini 1.5',
    visibility: '76%',
    status: 'Named in 12 citations',
    delta: '+3.4%',
    type: 'cited',
  },
] as const;

function HotspotBadge({
  title,
  description,
}: Readonly<{
  title: string;
  description: string;
}>) {
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.2 }}
      className="bg-mkt-surface border-mkt-proof text-mkt-ink flex items-center gap-3 rounded-lg border p-3 text-xs shadow-md"
    >
      <span className="relative flex size-3">
        <span className="bg-mkt-proof absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
        <span className="bg-mkt-proof relative inline-flex size-3 rounded-full" />
      </span>
      <div>
        <span className="text-mkt-proof block font-semibold">{title}</span>
        <span className="text-mkt-ink-soft text-[11px]">{description}</span>
      </div>
    </motion.div>
  );
}

const STEP_VIEWS = [
  {
    key: 'step-0',
    content: (
      <>
        {/* Metrics Bar */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="bg-mkt-surface border-mkt-line-soft rounded-lg border p-3.5 shadow-xs">
            <p className="text-mkt-meta text-mkt-ink-muted">Visibility Index</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-mkt-ink font-mono text-xl font-bold sm:text-2xl">72.4%</span>
              <span className="text-mkt-evidence-text font-mono text-xs font-semibold">+4.8%</span>
            </div>
          </div>
          <div className="bg-mkt-surface border-mkt-line-soft rounded-lg border p-3.5 shadow-xs">
            <p className="text-mkt-meta text-mkt-ink-muted">Share of Voice</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-mkt-ink font-mono text-xl font-bold sm:text-2xl">18.6%</span>
              <span className="text-mkt-evidence-text font-mono text-xs font-semibold">+2.1%</span>
            </div>
          </div>
          <div className="bg-mkt-surface border-mkt-line-soft rounded-lg border p-3.5 shadow-xs">
            <p className="text-mkt-meta text-mkt-ink-muted">Answers Tracked</p>
            <div className="mt-1">
              <span className="text-mkt-ink font-mono text-xl font-bold sm:text-2xl">1,248</span>
            </div>
          </div>
          <div className="bg-mkt-surface border-mkt-line-soft rounded-lg border p-3.5 shadow-xs">
            <p className="text-mkt-meta text-mkt-ink-muted">AI Sentiment</p>
            <div className="mt-1">
              <span className="text-mkt-evidence-text font-mono text-xl font-bold sm:text-2xl">
                89.2%
              </span>
            </div>
          </div>
        </div>

        {/* Engine Cards Grid */}
        <div className="grid gap-3 sm:grid-cols-3">
          {ENGINES_DATA.map((eng) => (
            <div
              key={eng.key}
              className="bg-mkt-surface border-mkt-line-soft rounded-lg border p-3.5 shadow-xs"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <EngineLogo engine={eng.key} className="text-mkt-ink size-4" />
                  <span className="text-mkt-ink text-xs font-semibold">{eng.name}</span>
                </div>
                <span className="bg-mkt-evidence-soft text-mkt-evidence-text rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold">
                  {eng.delta}
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-mkt-ink font-mono text-lg font-bold">{eng.visibility}</span>
                <span className="text-mkt-ink-muted text-[11px] font-medium">{eng.status}</span>
              </div>
            </div>
          ))}
        </div>

        <HotspotBadge
          title="Live AI Answer Matrix"
          description="Observes prompt answers across every model automatically every 24 hours."
        />
      </>
    ),
  },
  {
    key: 'step-1',
    content: (
      <>
        {/* Prompt Query & Output */}
        <div className="bg-mkt-surface border-mkt-line-soft rounded-lg border p-4 shadow-xs">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-mkt-ink-muted flex items-center gap-1.5 font-mono text-xs font-medium uppercase">
              <Search className="text-mkt-proof size-3.5" />
              Observed Buyer Question
            </span>
            <span className="bg-mkt-proof-soft text-mkt-proof rounded-md px-2 py-0.5 font-mono text-[10px]">
              ChatGPT 4.5
            </span>
          </div>
          <p className="text-mkt-ink text-sm font-semibold">
            “Which enterprise analytics platform provides verified AI visibility tracking?”
          </p>
          <div className="border-mkt-line-soft text-mkt-ink-soft mt-3 border-t pt-3 text-xs leading-relaxed">
            <span className="text-mkt-ink font-semibold">Answer Output: </span>
            “For enterprise AI visibility tracking, teams cite{' '}
            <strong className="text-mkt-proof">Searchify</strong> alongside traditional platforms
            for its verifiable citation trace and reproducible metrics.”
          </div>
        </div>

        {/* Evidence Chain Badges */}
        <div className="bg-mkt-surface border-mkt-line-soft rounded-lg border p-4 shadow-xs">
          <span className="text-mkt-ink-muted mb-2.5 block font-mono text-xs font-medium uppercase">
            Persisted Artifact Metadata
          </span>
          <div className="flex flex-wrap gap-2">
            <span className="bg-mkt-paper-raised border-mkt-line-soft text-mkt-ink rounded-md border px-2.5 py-1 font-mono text-xs">
              <span className="text-mkt-ink-muted uppercase">Provider:</span> ChatGPT
            </span>
            <span className="bg-mkt-paper-raised border-mkt-line-soft text-mkt-ink rounded-md border px-2.5 py-1 font-mono text-xs">
              <span className="text-mkt-ink-muted uppercase">Artifact:</span> #a3f9c1
            </span>
            <span className="bg-mkt-paper-raised border-mkt-line-soft text-mkt-ink rounded-md border px-2.5 py-1 font-mono text-xs">
              <span className="text-mkt-ink-muted uppercase">Analyzer:</span> visibility-v4.2
            </span>
            <span className="bg-mkt-evidence-soft border-mkt-evidence-line text-mkt-evidence-text flex items-center gap-1 rounded-md border px-2.5 py-1 font-mono text-xs font-semibold">
              <ShieldCheck className="size-3.5" /> 100% Reproducible
            </span>
          </div>
        </div>

        <HotspotBadge
          title="1-Click Verifiable Trace"
          description="Never guess why an LLM gave a score. Every metric links to raw text & versioned rule."
        />
      </>
    ),
  },
  {
    key: 'step-2',
    content: (
      <>
        {/* Share of Voice Comparison Bars */}
        <div className="bg-mkt-surface border-mkt-line-soft space-y-3 rounded-lg border p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-mkt-ink-muted font-mono text-xs font-medium uppercase">
              Market Share of Voice in AI Responses
            </span>
            <span className="text-mkt-proof font-mono text-xs font-semibold">Acme #1 Lead</span>
          </div>

          {/* Bar 1 - Acme */}
          <div>
            <div className="mb-1 flex justify-between text-xs font-semibold">
              <span className="text-mkt-ink flex items-center gap-1.5">
                <span className="bg-mkt-accent size-2 rounded-full" /> Acme Corp (You)
              </span>
              <span className="text-mkt-accent font-mono">38.4%</span>
            </div>
            <div className="bg-mkt-line-soft h-2.5 w-full overflow-hidden rounded-full">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '38.4%' }}
                transition={{ duration: 0.8, ease: EASE_OUT }}
                className="bg-mkt-accent h-full rounded-full"
              />
            </div>
          </div>

          {/* Bar 2 - Competitor A */}
          <div>
            <div className="text-mkt-ink-soft mb-1 flex justify-between text-xs">
              <span>Competitor A</span>
              <span className="font-mono">28.1%</span>
            </div>
            <div className="bg-mkt-line-soft h-2.5 w-full overflow-hidden rounded-full">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '28.1%' }}
                transition={{ duration: 0.8, delay: 0.1, ease: EASE_OUT }}
                className="bg-mkt-line-strong h-full rounded-full opacity-60"
              />
            </div>
          </div>

          {/* Bar 3 - Competitor B */}
          <div>
            <div className="text-mkt-ink-soft mb-1 flex justify-between text-xs">
              <span>Competitor B</span>
              <span className="font-mono">19.5%</span>
            </div>
            <div className="bg-mkt-line-soft h-2.5 w-full overflow-hidden rounded-full">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '19.5%' }}
                transition={{ duration: 0.8, delay: 0.2, ease: EASE_OUT }}
                className="bg-mkt-line-strong h-full rounded-full opacity-40"
              />
            </div>
          </div>
        </div>

        <HotspotBadge
          title="Competitive Brand Share"
          description="Know exactly how much market share rival products capture in buyer AI prompts."
        />
      </>
    ),
  },
  {
    key: 'step-3',
    content: (
      <>
        <div className="bg-mkt-surface border-mkt-line-soft flex items-center justify-between rounded-lg border p-3.5 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="bg-mkt-amber-soft text-mkt-amber-text border-mkt-amber-line/50 rounded-md border p-1.5">
              <Zap className="size-4" />
            </span>
            <div>
              <span className="text-mkt-ink block text-xs font-semibold">
                Update Deprecated Feature References
              </span>
              <span className="text-mkt-ink-muted text-[11px]">
                ChatGPT cites deprecated v2 docs in 14% of buyer queries
              </span>
            </div>
          </div>
          <span className="bg-mkt-accent shrink-0 cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-semibold text-white">
            Fix Now
          </span>
        </div>

        <div className="bg-mkt-surface border-mkt-line-soft flex items-center justify-between rounded-lg border p-3.5 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="bg-mkt-proof-soft text-mkt-proof border-mkt-proof-line/50 rounded-md border p-1.5">
              <Bot className="size-4" />
            </span>
            <div>
              <span className="text-mkt-ink block text-xs font-semibold">
                Publish Enterprise Support Matrix
              </span>
              <span className="text-mkt-ink-muted text-[11px]">
                Capture Gemini citations by indexing structured comparison table
              </span>
            </div>
          </div>
          <span className="bg-mkt-paper-raised border-mkt-line text-mkt-ink shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-semibold">
            View Draft
          </span>
        </div>

        <div className="bg-mkt-surface border-mkt-line-soft flex items-center justify-between rounded-lg border p-3.5 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="bg-mkt-evidence-soft text-mkt-evidence-text border-mkt-evidence-line/50 rounded-md border p-1.5">
              <CheckCircle2 className="size-4" />
            </span>
            <div>
              <span className="text-mkt-ink block text-xs font-semibold">
                Schema Markup for Claude Crawlers
              </span>
              <span className="text-mkt-ink-muted text-[11px]">
                Applied & Verified across 18 product pages
              </span>
            </div>
          </div>
          <span className="text-mkt-evidence-text flex items-center gap-1 font-mono text-xs font-semibold">
            Applied ✓
          </span>
        </div>

        <HotspotBadge
          title="Automated AI Growth Plan"
          description="Turn visibility gaps into targeted content edits to ensure AI engines recommend you first."
        />
      </>
    ),
  },
];

/**
 * Interactive Real-Time Product Tour Hero visual component.
 */
export function HeroVisual() {
  const reduceMotion = useReducedMotion();
  const { activeStep, isPlaying, selectStep, togglePlay } = useTourAutoplay(
    TOUR_STEPS.length,
    5500,
  );

  const currentStep = TOUR_STEPS[activeStep];

  return (
    <div className="relative">
      {/* Soft atmospheric glow halo */}
      <div className="bg-mkt-accent-soft absolute -inset-6 -z-1 rounded-[2.5rem] opacity-70 blur-3xl" />

      {/* Main SaaS Frame */}
      <div className="bg-mkt-surface border-mkt-line-soft shadow-card rounded-2xl border p-3 sm:p-5 lg:p-6">
        {/* Top App Chrome Header */}
        <div className="border-mkt-line-soft mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3.5">
          <div className="flex items-center gap-2.5">
            {/* Window Controls */}
            <div className="flex items-center gap-1.5 pr-2">
              <span className="size-3 rounded-full bg-rose-400/80" />
              <span className="size-3 rounded-full bg-amber-400/80" />
              <span className="size-3 rounded-full bg-emerald-400/80" />
            </div>
            <div className="bg-mkt-paper-raised border-mkt-line-soft flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold">
              <span className="bg-mkt-proof size-2 animate-pulse rounded-full" />
              <span className="text-mkt-ink">Acme Corp AI Workspace</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Live Model Indicators */}
            <div className="hidden items-center gap-2 pr-2 sm:flex">
              <span className="border-mkt-line-soft bg-mkt-paper-raised text-mkt-ink-muted flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px]">
                <EngineLogo engine="openai" className="text-mkt-ink size-3" />
                ChatGPT
              </span>
              <span className="border-mkt-line-soft bg-mkt-paper-raised text-mkt-ink-muted flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px]">
                <EngineLogo engine="claude" className="text-mkt-engine-claude size-3" />
                Claude
              </span>
              <span className="border-mkt-line-soft bg-mkt-paper-raised text-mkt-ink-muted flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px]">
                <EngineLogo engine="gemini" className="text-mkt-engine-gemini size-3" />
                Gemini
              </span>
            </div>
            <ExampleDataNote />
          </div>
        </div>

        {/* Interactive Tour Stepper Bar */}
        <TourStepper
          steps={TOUR_STEPS}
          activeStep={activeStep}
          isPlaying={isPlaying}
          onSelectStep={selectStep}
          onTogglePlay={togglePlay}
          className="bg-mkt-paper-raised border-mkt-line-soft/80 mb-5 rounded-xl border p-2"
        />

        {/* Feature Highlight Callout Banner */}
        <div className="bg-mkt-proof-soft/40 border-mkt-proof-line/30 text-mkt-proof mb-4 flex items-center justify-between rounded-lg border px-3.5 py-2 text-xs font-medium">
          <div className="flex items-center gap-2">
            <Sparkles className="text-mkt-proof size-4 shrink-0 animate-pulse" />
            <span className="font-semibold">{currentStep.badge}:</span>
            <span className="text-mkt-ink hidden sm:inline">{currentStep.highlight}</span>
            <span className="text-mkt-ink truncate sm:hidden">{currentStep.title}</span>
          </div>
          <span className="text-mkt-proof font-mono text-[11px] font-bold tracking-wider uppercase">
            Interactive Tour
          </span>
        </div>

        {/* Main Dynamic View Area */}
        <div className="bg-mkt-paper-raised border-mkt-line-soft relative min-h-[300px] overflow-hidden rounded-xl border p-4 sm:min-h-[340px] sm:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={STEP_VIEWS[activeStep].key}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
              className="space-y-4"
            >
              {STEP_VIEWS[activeStep].content}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
