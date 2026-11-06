/** The `llm_scraper` surface (consumer chat apps through DataForSEO's LLM scraper). */
import { createHash } from 'node:crypto';
import { providerPolicy } from '../../providers/config.ts';
import { ProviderError } from '../../providers/errors.ts';
import type { SearchEngine } from '../../search-surfaces/dataforseo.ts';
import { parseScraper } from '../../search-surfaces/parsing.ts';
import { readFrozenSearchRequest } from '../frozen-configuration.ts';
import { persistExecutionSuccess, persistSurfaceFailure } from '../result-persistence.ts';
import { surfaceRecoveryDeadline } from '../submission-intent.ts';
import { frozenRequestSettings, observedAdapter, type ObservedSurface } from './dataforseo.ts';

export const llmScraperSurface: ObservedSurface = {
  /** A submission with no task id yet reconciles under the reconciliation pool, not the answer pool. */
  capacity(task, context) {
    const capacity = { ...context.capacity };
    if (task.provider_submission_ref && !task.provider_task_id && capacity.source === 'byok') {
      capacity.engine = providerPolicy.scraper_reconciliation_capacity_engine;
      capacity.accountPoolIdentity = createHash('sha256')
        .update(`${capacity.accountPoolIdentity}:${capacity.engine}`)
        .digest('hex');
    }
    return capacity;
  },
  recoveryDeadline: (task) =>
    surfaceRecoveryDeadline(
      task,
      readFrozenSearchRequest(task.request_snapshot).recovery_deadline_hours,
    ),
  // Retrieval is bounded by the recovery deadline, never by a poll count.
  pollCeiling: false,
  requestSettings: frozenRequestSettings,
  async settle(deps, context, payload, taskId) {
    const engine = context.task.logical_engine as Exclude<SearchEngine, 'google_ai_overview'>;
    const result = parseScraper(payload, taskId, engine);
    if (result === 'still_pending') return 'still_pending';
    await persistExecutionSuccess(
      deps.db,
      context.task,
      deps.owner,
      result,
      await deps.derivation(context, result),
      { surface: true, at: deps.now() },
    );
    return 'settled';
  },
  failTask: (deps, task, context, { code, exchange, error }) =>
    persistSurfaceFailure(
      deps.db,
      task,
      deps.owner,
      error ?? new ProviderError(code),
      deps.runtime,
      {
        exchange,
        record: { kind: 'failure_artifact', outcome: code },
        context,
        at: deps.now(),
      },
    ),
};

export const llmScraperAdapter = observedAdapter(llmScraperSurface);
