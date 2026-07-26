import { cn } from '@/lib/utils';

import { EngineLogo } from './engine-logo';

/**
 * Provider identity. The engines Searchify actually audits come first; the
 * rest appear only in coverage scenes. Keeping the roster in one place stops
 * pages from inventing providers to fill a row — the deck's "never fabricate
 * scale" rule, made structural.
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
  perplexity: {
    label: 'Perplexity',
    tile: 'bg-mkt-engine-perplexity',
    dot: 'bg-mkt-engine-perplexity',
    mark: 'text-mkt-engine-perplexity',
  },
  grok: {
    label: 'Grok',
    tile: 'bg-mkt-engine-grok',
    dot: 'bg-mkt-engine-grok',
    mark: 'text-mkt-engine-grok',
  },
  copilot: {
    label: 'Microsoft Copilot',
    tile: 'bg-mkt-engine-copilot',
    dot: 'bg-mkt-engine-copilot',
    mark: 'text-mkt-engine-copilot',
  },
} as const;

export type EngineKey = keyof typeof ENGINES;

/** Audited today — the only set any factual claim may be made about. */
export const AUDITED_ENGINES: readonly EngineKey[] = ['openai', 'gemini', 'claude'];

/**
 * The full supported roster, in display order. Providers are a UI-level
 * addition and paid workspaces can connect any provider they hold keys for,
 * so coverage surfaces may show all of these unqualified.
 *
 * AUDITED_ENGINES stays a separate, narrower list: it is the set the DEFAULT
 * workspace audits out of the box, and remains the only set a specific
 * measured claim ("we observed X across…") may be made about.
 */
export const ALL_ENGINES: readonly EngineKey[] = [
  'openai',
  'gemini',
  'claude',
  'perplexity',
  'grok',
  'copilot',
];

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
          'text-mkt-surface grid size-5 shrink-0 place-items-center rounded-[0.375rem]',
          'text-[0.5625rem] font-medium',
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
 * six competing rectangles to the first screen for no meaning.
 *
 * Every provider in the roster has a vendored mark, so there is no initial
 * fallback here; the mark takes the provider's own colour.
 */
export function EngineWordmark({
  engine,
  className,
}: Readonly<{ engine: EngineKey; className?: string }>) {
  const { label, mark } = ENGINES[engine];
  return (
    <span
      className={cn(
        'text-mkt-ink-soft inline-flex items-center gap-2.5 text-[1.0625rem] font-semibold',
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
    <span className={cn('text-mkt-slate text-mkt-sm inline-flex items-center gap-2', className)}>
      <span aria-hidden className={cn('size-1.75 shrink-0 rounded-full', dot)} />
      {label}
    </span>
  );
}
