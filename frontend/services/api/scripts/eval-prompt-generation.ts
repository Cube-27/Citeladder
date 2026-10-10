/**
 * Live prompt-generation calibration: each business-context fixture through
 * the quick-generate planner, the configured model and admission, scored by the
 * deterministic set metrics against the configured thresholds. Operator-run
 * only (it calls the provider and spends budget); never part of CI. Metrics and
 * the selected responses append to one log in the worktree's Git directory.
 */
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { policy } from '../src/config.ts';
import { gitDirectory } from './git-directory.ts';
import { createModelGateway } from '../src/models/gateway.ts';
import { generateDrafts } from '../src/prompts/generation-drafts.ts';
import { generationInput, generationSetting } from '../src/prompts/generation-input.ts';
import { setMetrics, thresholdFailures } from '../src/prompts/generation-metrics.ts';
import { selectDrafts } from '../src/prompts/generation-quality.ts';
import { fixtureContext, generationFixtures } from '../test/fixtures/prompt-generation/context.ts';

const { values } = parseArgs({
  options: {
    live: { type: 'boolean', default: false },
    count: { type: 'string', default: '20' },
    fixture: { type: 'string' },
  },
});
if (!values.live)
  throw new Error('Calibration calls the configured model provider; pass --live to run it');
const count = Number(values.count);
// The same ceiling the API enforces, so an eval cannot outspend a request.
if (!Number.isInteger(count) || count < 1 || count > generationSetting('max_count'))
  throw new Error(`--count must be an integer from 1 to ${generationSetting('max_count')}`);
const gateway = createModelGateway();
const log = join(gitDirectory(process.cwd()), 'prompt-generation-eval.log');
const run = new Date().toISOString();

/** One fixture through planning, the live model, admission and selection, scored. */
async function evaluate(fixture: (typeof generationFixtures)[number]) {
  const started = performance.now();
  const output = await generateDrafts(
    fixtureContext(fixture),
    generationInput.parse({ count }),
    gateway,
    AbortSignal.timeout(generationSetting('generation_deadline_seconds') * 1000),
  );
  const selected = selectDrafts(output.drafts, count);
  const metrics = setMetrics({
    texts: selected.map((draft) => draft.text),
    stages: selected.map((draft) => draft.buyer_stage),
    intents: selected.map((draft) => draft.prompt_intent),
    offerings: fixture.offerings,
    offeringOf: selected.map((draft) => draft.slot.buyer_need.offering ?? ''),
    category: fixture.business_context.category_terms,
    geo: fixture.geo_terms,
    brands: [
      fixture.brand_name,
      ...fixture.brand_aliases,
      ...fixture.competitors.map((row) => row.name),
    ],
  });
  return {
    run,
    fixture: fixture.name,
    generator_version: policy.prompts.generation.version,
    elapsed_ms: Math.round(performance.now() - started),
    stop: output.stop,
    admission_drops: output.drops,
    metrics,
    failures: thresholdFailures(metrics, {
      market_scope: String(fixture.business_context.market_scope),
      requested: count,
    }),
    models: output.models,
    responses: selected.map((draft) => ({
      buyer_need: draft.slot.buyer_need,
      target_buyer_stage: draft.slot.target_buyer_stage,
      text: draft.text,
      buyer_stage: draft.buyer_stage,
      prompt_intent: draft.prompt_intent,
      names_place: draft.names_place ?? null,
    })),
  };
}

const records = await Promise.all(
  generationFixtures
    .filter((item) => !values.fixture || item.name === values.fixture)
    .map(evaluate),
);
await appendFile(log, records.map((record) => `${JSON.stringify(record)}\n`).join(''));
for (const { fixture, metrics, failures } of records) {
  const verdict = failures.length ? 'failed ' + failures.join(', ') : 'within thresholds';
  const located = metrics.located_share.toFixed(2);
  process.stdout.write(
    `${fixture}: ${metrics.count}/${count} selected, located ${located}, ${verdict}\n`,
  );
}
process.stdout.write(`Log: ${log}\n`);
