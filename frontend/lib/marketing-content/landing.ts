export type LandingChapter = {
  number: string;
  eyebrow: string;
  title: string;
  body: string;
  scene: 'prompts' | 'engines' | 'evidence' | 'receipt';
};

export type LandingFeature = {
  key: 'share' | 'scoring' | 'evidence' | 'byok' | 'health' | 'benchmark' | 'trends';
  title: string;
  body: string;
  wide?: boolean;
};

export const LANDING_CONTENT = {
  hero: {
    eyebrow: 'Answer-engine optimization',
    title: 'When buyers ask AI,',
    accent: 'own the answer.',
    body:
      "Searchify audits how ChatGPT, Gemini, and Claude answer your buyers' questions—scoring every mention, citation, and competitor with deterministic evidence, down to the raw response.",
    primaryCta: 'Run your first audit',
    secondaryCta: 'See how it works',
  },
  shift: {
    eyebrow: 'The shift',
    title: 'The first page of search is now a conversation.',
    body:
      "Buyers don't compare ten blue links anymore. They ask once—and trust the answer they get. Your ranking table didn't come with you.",
  },
  chapters: [
    {
      number: '01',
      eyebrow: 'Ask',
      title: 'Ask like a buyer.',
      body: 'Your prompt library mirrors the questions buyers actually ask—comparisons, best-of lists, alternatives—grouped by intent.',
      scene: 'prompts',
    },
    {
      number: '02',
      eyebrow: 'Compare',
      title: 'Every engine. Same questions.',
      body:
        'The same prompts and repetitions run across ChatGPT, Gemini, and Claude, giving you a comparable view without cherry-picking answers.',
      scene: 'engines',
    },
    {
      number: '03',
      eyebrow: 'Prove',
      title: 'Scored, not vibes.',
      body: 'Mentions, citations, and share of voice are computed from raw response text with versioned analyzers and rules. Same data, same score.',
      scene: 'evidence',
    },
    {
      number: '04',
      eyebrow: 'Inspect',
      title: 'Drill to the receipts.',
      body: 'Every metric links to the exact run and response it came from—the prompt, engine, and classified citations.',
      scene: 'receipt',
    },
  ] satisfies readonly LandingChapter[],
  features: [
    {
      key: 'share',
      title: 'Share of answers',
      body: 'See which brands engines recommend, broken down by prompt and engine.',
      wide: true,
    },
    {
      key: 'scoring',
      title: 'Deterministic scoring',
      body: 'Versioned rules over persisted responses—not an opaque LLM judging another LLM.',
    },
    {
      key: 'evidence',
      title: 'Evidence explorer',
      body: 'Move from an aggregate score to the exact answer and classified citations.',
    },
    {
      key: 'byok',
      title: 'Your provider keys',
      body: 'OpenAI, Google, and Anthropic keys are encrypted at rest and never returned.',
    },
    {
      key: 'health',
      title: 'Site health, connected',
      body: 'Audit the pages answer engines may rely on, with technical and AEO issues by URL.',
    },
    {
      key: 'benchmark',
      title: 'Competitor benchmarking',
      body: 'Track the set that matters and watch share of voice shift engine by engine.',
    },
    {
      key: 'trends',
      title: 'Cross-run trends',
      body: 'Rerun on your cadence and read visibility, mentions, and citations over time.',
    },
  ] satisfies readonly LandingFeature[],
  proof: [
    { value: '3', label: 'answer engines measured side by side' },
    { value: 'Every', label: 'reported metric linked to persisted evidence' },
    { value: '0', label: 'LLM-as-judge calls in deterministic scoring' },
    { value: '1', label: 'workspace for visibility, evidence, and site health' },
  ],
} as const;
