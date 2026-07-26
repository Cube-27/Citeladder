import { cn } from '@/lib/utils';

import { EngineLogo, isOfficialEngine } from './engine-logo';

/**
 * Provider identity. The engines Searchify actually audits come first; the
 * rest appear only in coverage scenes. Keeping the roster in one place stops
 * pages from inventing providers to fill a row — the deck's "never fabricate
 * scale" rule, made structural.
 */
export const ENGINES = {
  openai: {
    label: 'OpenAI',
    initial: 'O',
    tile: 'bg-mkt-engine-openai',
    dot: 'bg-mkt-engine-openai',
  },
  claude: {
    label: 'Claude',
    initial: 'C',
    tile: 'bg-mkt-engine-claude',
    dot: 'bg-mkt-engine-claude',
  },
  gemini: {
    label: 'Gemini',
    initial: 'G',
    tile: 'bg-mkt-engine-gemini',
    dot: 'bg-mkt-engine-gemini',
  },
  perplexity: {
    label: 'Perplexity',
    initial: 'P',
    tile: 'bg-mkt-engine-perplexity',
    dot: 'bg-mkt-engine-perplexity',
  },
  grok: { label: 'Grok', initial: 'X', tile: 'bg-mkt-engine-grok', dot: 'bg-mkt-engine-grok' },
  copilot: {
    label: 'Microsoft Copilot',
    initial: 'M',
    tile: 'bg-mkt-engine-copilot',
    dot: 'bg-mkt-engine-copilot',
  },
} as const;

export type EngineKey = keyof typeof ENGINES;

/** Audited today — the only set any factual claim may be made about. */
export const AUDITED_ENGINES: readonly EngineKey[] = ['openai', 'gemini', 'claude'];

export function EngineChip({
  engine,
  className,
}: Readonly<{ engine: EngineKey; className?: string }>) {
  const { label, initial, tile } = ENGINES[engine];
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
        {isOfficialEngine(engine) ? <EngineLogo engine={engine} className="size-3.5" /> : initial}
      </span>
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
