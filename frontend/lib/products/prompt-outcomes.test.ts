import { describe, expect, it } from 'vite-plus/test';

import type { CommerceProductDetail } from '@citeladder/contracts/commerce-suite';

import { productPromptOutcomes, type ProductRun } from './prompt-outcomes';

const PROMPT = '99999999-9999-4999-8999-999999999999';

function outcomeOf(rank: number | null): ProductRun['outcome'] {
  if (rank === null) return 'unranked';
  return rank === 1 ? 'won' : 'lost';
}

function run(
  id: number,
  prompt_text: string,
  engine: string,
  rank: number | null,
  completed_at: string,
): ProductRun {
  const task = `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`;
  return {
    task_id: task,
    audit_id: task,
    prompt_text,
    engine,
    completed_at,
    rank,
    outcome: outcomeOf(rank),
  };
}

function detail(
  answers: ProductRun[],
  prompts: CommerceProductDetail['prompts'],
): CommerceProductDetail {
  return {
    window_days: 30,
    executions: 6,
    product: {
      holder_id: PROMPT,
      kind: 'owned',
      name: 'Road Runner',
      brand: 'Acme',
      url: 'https://shop.example/road',
      category_ids: [],
      visibility: null,
      appearances: 0,
      ordered_appearances: 0,
      win_rate: null,
      position: null,
      mentioned_price: { median: null, currency: 'USD', quoted: 0, other_currency: 0 },
      catalog_price: null,
      merchants: [],
      description: '',
      image_url: null,
      catalog: null,
    },
    competing: [],
    merchants: [],
    seen_in: [],
    sources: [],
    fan_out_queries: [],
    prompts,
    answers,
    answer_total: 9,
    actions: [],
  };
}

describe('productPromptOutcomes', () => {
  it('folds a prompt’s runs per engine, keeps untracked prompt texts and states the run sample', () => {
    const outcomes = productPromptOutcomes(
      detail(
        [
          run(1, 'best road shoes', 'chatgpt', 2, '2026-11-03T00:00:00Z'),
          run(2, 'best road shoes', 'claude', 1, '2026-11-03T00:00:00Z'),
          run(3, 'best road shoes', 'chatgpt', 1, '2026-11-02T00:00:00Z'),
          run(4, 'trail shoes under 100', 'chatgpt', null, '2026-11-01T00:00:00Z'),
          run(5, 'best road shoes', 'chatgpt', 3, '2026-11-01T00:00:00Z'),
        ],
        [
          {
            prompt_id: PROMPT,
            text: 'best road shoes',
            executions: 6,
            appearances: 4,
            visibility: 4 / 6,
            win_rate: 0.5,
            position: 1.75,
          },
        ],
      ),
    );

    expect(outcomes.runs).toEqual({ shown: 5, total: 9 });
    expect(outcomes.engines).toEqual([
      {
        engine: 'chatgpt',
        named: 4,
        won: 1,
        lost: 2,
        unranked: 1,
        winRate: 1 / 3,
        position: 2,
      },
      { engine: 'claude', named: 1, won: 1, lost: 0, unranked: 0, winRate: 1, position: 1 },
    ]);
    expect(
      outcomes.prompts.map((row) => ({
        key: row.key,
        tracked: row.metrics !== null,
        engines: Object.fromEntries(
          [...row.engines].map(([engine, cell]) => [
            engine,
            `${cell.won}/${cell.lost}/${cell.unranked} latest ${cell.latest.task_id.slice(-1)}`,
          ]),
        ),
      })),
    ).toEqual([
      {
        key: PROMPT,
        tracked: true,
        engines: { chatgpt: '1/2/0 latest 1', claude: '1/0/0 latest 2' },
      },
      { key: 'trail shoes under 100', tracked: false, engines: { chatgpt: '0/0/1 latest 4' } },
    ]);
  });

  it('leaves win rate and position unknown for an engine that only named it unranked', () => {
    const [engine] = productPromptOutcomes(
      detail([run(1, 'gift ideas', 'gemini', null, '2026-11-01T00:00:00Z')], []),
    ).engines;
    expect(engine).toEqual({
      engine: 'gemini',
      named: 1,
      won: 0,
      lost: 0,
      unranked: 1,
      winRate: null,
      position: null,
    });
  });
});
