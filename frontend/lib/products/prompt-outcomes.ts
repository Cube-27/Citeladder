import type { CommerceProductDetail } from '@citeladder/contracts/commerce-suite';

type Detail = CommerceProductDetail;
export type ProductRun = Detail['answers'][number];
type PromptMetrics = Detail['prompts'][number];

type Tally = Readonly<{ named: number; won: number; lost: number; unranked: number }>;

type EngineOutcome = Tally &
  Readonly<{ engine: string; winRate: number | null; position: number | null }>;

export type PromptEngineCell = Tally & Readonly<{ latest: ProductRun }>;

type PromptOutcomeRow = Readonly<{
  key: string;
  text: string;
  metrics: PromptMetrics | null;
  engines: ReadonlyMap<string, PromptEngineCell>;
}>;

export type ProductPromptOutcomes = Readonly<{
  engines: readonly EngineOutcome[];
  prompts: readonly PromptOutcomeRow[];
  runs: Readonly<{ shown: number; total: number }>;
}>;

const EMPTY: Tally = { named: 0, won: 0, lost: 0, unranked: 0 };

const counted = (tally: Tally, run: ProductRun): Tally => ({
  named: tally.named + 1,
  won: tally.won + (run.outcome === 'won' ? 1 : 0),
  lost: tally.lost + (run.outcome === 'lost' ? 1 : 0),
  unranked: tally.unranked + (run.outcome === 'unranked' ? 1 : 0),
});

function engineOutcome(engine: string, runs: readonly ProductRun[]): EngineOutcome {
  const tally = runs.reduce((tally, run) => counted(tally, run), EMPTY);
  const ranks = runs.flatMap((run) => (run.rank === null ? [] : [run.rank]));
  const ordered = tally.won + tally.lost;
  return {
    engine,
    ...tally,
    winRate: ordered ? tally.won / ordered : null,
    position: ranks.length ? ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length : null,
  };
}

function groupBy<K>(runs: readonly ProductRun[], key: (run: ProductRun) => K) {
  const groups = new Map<K, ProductRun[]>();
  for (const run of runs) groups.set(key(run), [...(groups.get(key(run)) ?? []), run]);
  return groups;
}

function engineCells(runs: readonly ProductRun[]): ReadonlyMap<string, PromptEngineCell> {
  const cells = new Map<string, PromptEngineCell>();
  for (const [engine, engineRuns] of groupBy(runs, (run) => run.engine)) {
    const [latest] = engineRuns;
    if (latest)
      cells.set(engine, {
        ...engineRuns.reduce((tally, run) => counted(tally, run), EMPTY),
        latest,
      });
  }
  return cells;
}

export function productPromptOutcomes(
  detail: Pick<Detail, 'answers' | 'prompts' | 'answer_total'>,
): ProductPromptOutcomes {
  const byPrompt = groupBy(detail.answers, (run) => run.prompt_text);
  const engines = [...groupBy(detail.answers, (run) => run.engine)]
    .map(([engine, runs]) => engineOutcome(engine, runs))
    .sort((a, b) => b.named - a.named || a.engine.localeCompare(b.engine));
  const tracked = new Set(detail.prompts.map((prompt) => prompt.text));
  const prompts: PromptOutcomeRow[] = [
    ...detail.prompts.map((metrics) => ({
      key: metrics.prompt_id ?? metrics.text,
      text: metrics.text,
      metrics,
      engines: engineCells(byPrompt.get(metrics.text) ?? []),
    })),
    ...[...byPrompt]
      .filter(([text]) => !tracked.has(text))
      .map(([text, runs]) => ({ key: text, text, metrics: null, engines: engineCells(runs) })),
  ];
  return {
    engines,
    prompts,
    runs: { shown: detail.answers.length, total: detail.answer_total },
  };
}
