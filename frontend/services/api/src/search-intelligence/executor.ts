import { z } from 'zod';
import { policy, resolveSettingSpec } from '../config.ts';
import { auditRuntime } from '../audits/config.ts';
import { ProviderError } from '../answer-engines/contracts.ts';
import { acquireCapacity, releaseCapacity, type CapacityRequest } from '../providers/capacity.ts';
import type { Executor } from '../workers/executor.ts';
import { record } from '../db/json.ts';
import { AcquisitionState } from './acquisition-state.ts';
import { executeLive } from './live.ts';
import { si } from './requests.ts';

/** Finite frozen plan: park without spending queue attempts; an ambiguous paid dispatch is never repeated. */
export function acquisitionExecutor(
  options: { send?: typeof fetch; env?: Record<string, string | undefined> } = {},
): Executor {
  return async (task, context) => {
    const runId = z.uuid().parse(record(task.payload).run_id);
    if (!task.project_id) throw new Error('Research acquisition requires its project');
    const state = new AcquisitionState(context.db, task, runId),
      plans = await state.start();
    if (!plans) return;
    const runtime = auditRuntime(options.env),
      encryptionKey = String(resolveSettingSpec(policy.settings.encryption_key, options.env));
    for (const [sequence, plan] of plans.entries()) {
      await context.checkCancelled('research plan');
      const prepared = await state.prepare(plan, sequence);
      if (prepared.action === 'stop') return;
      if (prepared.action === 'skip') continue;
      if (prepared.action === 'publish') {
        if (await state.publish(plan, prepared.call.id, plans.slice(sequence + 1))) return;
        continue;
      }
      const capacity: CapacityRequest = {
        taskId: null,
        analyticsTaskId: task.id,
        attempt: sequence * (si.rate_limit_retries + 1) + prepared.ordinal,
        engine: 'search_intelligence',
        transport: 'dataforseo',
        source: 'byok',
        connectionId: prepared.run.connection_id,
        accountPoolIdentity: prepared.run.account_identity,
      };
      const decision = await acquireCapacity(context.db, capacity, runtime);
      if (!decision.acquired) {
        await state.park(decision.availableAt);
        return;
      }
      let error: ProviderError | undefined;
      let sent = false;
      try {
        await context.checkCancelled('paid research dispatch');
        if (!(await state.dispatch(prepared))) return;
        sent = true;
        const response = await executeLive(
          {
            encryptedSecret: prepared.secret,
            encryptionKey,
            baseUrl: prepared.baseUrl,
            endpoint: prepared.call.endpoint,
            payload: record(prepared.call.sanitized_request),
          },
          options,
        );
        await state.saveResponse(prepared.call.id, response);
      } catch (cause) {
        if (!sent || !(cause instanceof ProviderError)) throw cause;
        error = cause;
      } finally {
        await releaseCapacity(context.db, capacity, runtime, {
          rateLimited: error?.code === 'rate_limit',
          retryAfterSeconds: error?.retryAfterSeconds,
        });
      }
      if (error) {
        const result = await state.fail(prepared, error);
        if (result.wait) {
          await state.park(result.wait);
          return;
        }
        if (result.stop) return;
      } else if (await state.publish(plan, prepared.call.id, plans.slice(sequence + 1))) return;
    }
    await state.finish();
  };
}
export const acquireResearch = acquisitionExecutor();
