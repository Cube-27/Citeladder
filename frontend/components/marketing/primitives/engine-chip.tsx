import { cn } from '@/lib/utils';

import { EngineLogo } from './engine-logo';

/**
 * Provider identity. Exactly the engines Searchify audits — one approved
 * transport per engine (backend/app/core/config/provider_catalog.py). Keeping
 * the roster in one place stops pages from inventing providers to fill a
 * row — the deck's "never fabricate scale" rule, made structural. Referral
 * sources the analytics surface can detect (Perplexity, Microsoft Copilot,
 * Google AI Overview) are NOT engines and never appear here.
 */
export const ENGINES = {
  openai: {
    label: 'OpenAI',
    tile: 'bg-mkt-engine-openai',
    dot: 'bg-mkt-engine-openai',
    mark: 'text-mkt-engine-openai',
  },
  claude: {
    label: 'Claude',
    tile: 'bg-mkt-engine-claude',
    dot: 'bg-mkt-engine-claude',
    mark: 'text-mkt-engine-claude',
  },
  gemini: {
    label: 'Gemini',
    tile: 'bg-mkt-engine-gemini',
    dot: 'bg-mkt-engine-gemini',
    mark: 'text-mkt-engine-gemini',
  },
} as const;

export type EngineKey = keyof typeof ENGINES;

/** The complete audited roster. One approved transport per engine (provider_catalog.py). */
export const ENGINE_KEYS: readonly EngineKey[] = ['openai', 'gemini', 'claude'];

export function EngineChip({
  engine,
  className,
}: Readonly<{ engine: EngineKey; className?: string }>) {
  const { label, tile } = ENGINES[engine];
  return (
    <span
      className={cn(
        'border-mkt-line bg-mkt-surface text-mkt-sm rounded-mkt-sm inline-flex items-center gap-2.5',
        'border px-3 py-2.5 font-semibold',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'text-mkt-surface grid size-5 shrink-0 place-items-center rounded-md',
          'text-2xs font-medium',
          tile,
        )}
      >
        <EngineLogo engine={engine} className="size-3.5" />
      </span>
      {label}
    </span>
  );
}

/**
 * Bare form for the hero strip — the official brand mark plus the name, set
 * directly on the paper with no card, border or tile behind either. The strip
 * is a passing roster, not a set of tappable objects, so chip chrome would add
 * competing rectangles to the first screen for no meaning.
 *
 * Every engine in the roster has a vendored mark, so there is no initial
 * fallback here; the mark takes the engine's own colour.
 */
export function EngineWordmark({
  engine,
  className,
}: Readonly<{ engine: EngineKey; className?: string }>) {
  const { label, mark } = ENGINES[engine];
  return (
    <span
      className={cn(
        'text-mkt-ink-soft text-heading-sm inline-flex items-center gap-2.5 font-semibold',
        className,
      )}
    >
      <EngineLogo engine={engine} className={cn('size-5 shrink-0', mark)} />
      {label}
    </span>
  );
}

/** Compact form for scene surfaces — a coloured dot instead of a tile. */
export function EngineDot({
  engine,
  className,
}: Readonly<{ engine: EngineKey; className?: string }>) {
  const { label, dot } = ENGINES[engine];
  return (
    <span className={cn('text-mkt-ink-soft text-mkt-sm inline-flex items-center gap-2', className)}>
      <span aria-hidden className={cn('size-2 shrink-0 rounded-full', dot)} />
      {label}
    </span>
  );
}
