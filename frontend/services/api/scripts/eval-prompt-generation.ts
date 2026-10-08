/**
 * Live prompt-generation calibration: each business-context fixture through
 * the quick-generate planner, the configured model and admission, scored by the
 * deterministic set metrics against the configured thresholds. Operator-run
 * only (it calls the provider and spends budget); never part of CI. Metrics and
 * the selected responses append to one log in the worktree's Git directory.
 */
import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { policy } from '../src/config.ts';
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
const gateway = createModelGateway();
const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
  encoding: 'utf8',
}).trim();
const log = join(gitDir, 'prompt-generation-eval.log');
const run = new Date().toISOString();

for (const fixture of generationFixtures.filter(
  (item) => !values.fixture || item.name === values.fixture,
)) {
  const context = fixtureContext(fixture);
  const input = generationInput.parse({ count });
  const started = performance.now();
  const output = await generateDrafts(
    context,
    input,
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
  const failures = thresholdFailures(metrics, {
    market_scope: String(fixture.business_context.market_scope),
    requested: count,
  });
  await appendFile(
    log,
    `${JSON.stringify({
      run,
      fixture: fixture.name,
      generator_version: policy.prompts.generation.version,
      elapsed_ms: Math.round(performance.now() - started),
      stop: output.stop,
      admission_drops: output.drops,
      metrics,
      failures,
      models: output.models,
      responses: selected.map((draft) => ({
        buyer_need: draft.slot.buyer_need,
        target_buyer_stage: draft.slot.target_buyer_stage,
        text: draft.text,
        buyer_stage: draft.buyer_stage,
        prompt_intent: draft.prompt_intent,
        names_place: draft.names_place ?? null,
      })),
    })}\n`,
  );
  process.stdout.write(
    `${fixture.name}: ${metrics.count}/${count} selected, located ${metrics.located_share.toFixed(2)}, ` +
      `${failures.length ? `failed ${failures.join(', ')}` : 'within thresholds'}\n`,
  );
}
process.stdout.write(`Log: ${log}\n`);
