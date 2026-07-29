export const ENGINES = {
  openai: { label: 'OpenAI', tile: 'bg-mkt-engine-openai' },
  claude: { label: 'Claude', tile: 'bg-mkt-engine-claude' },
  gemini: { label: 'Gemini', tile: 'bg-mkt-engine-gemini' },
} as const;

export type EngineKey = keyof typeof ENGINES;

/** The complete audited roster. One approved transport per engine. */
export const ENGINE_KEYS: readonly EngineKey[] = ['openai', 'gemini', 'claude'];
