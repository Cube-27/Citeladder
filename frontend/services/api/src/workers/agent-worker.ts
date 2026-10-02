import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { getLogger } from '../logging.ts';
import { createAgentBindings } from '../agent/bindings.ts';
import { runAgentOnce } from '../agent/worker.ts';
import { waitForPoll } from './poll.ts';

const logger = getLogger('app.workers.agent_worker');
export class AgentWorker {
  readonly owner: string;
  readonly db: Database;
  readonly dependencies: Awaited<ReturnType<typeof createAgentBindings>>;
  readonly workspaceId?: string;
  constructor(
    db: Database,
    dependencies: AgentWorker['dependencies'],
    owner = `agent-worker-${randomUUID().slice(0, 12)}`,
    workspaceId?: string,
  ) {
    this.db = db;
    this.dependencies = dependencies;
    this.owner = owner;
    this.workspaceId = workspaceId;
  }
  private async workspaces() {
    const grace = this.dependencies.settings.leaseMarginSeconds;
    let selection = this.db
      .selectFrom('agent_runs')
      .select('workspace_id')
      .select(sql<Date>`min(available_at)`.as('due'))
      .where((eb) =>
        eb.or([
          eb.and([
            eb('status', 'in', policy.task_queue.claimable),
            eb('available_at', '<=', sql<Date>`clock_timestamp()`),
          ]),
          eb.and([
            eb('status', 'in', ['leased', 'running']),
            eb('lease_expires_at', '<=', sql<Date>`clock_timestamp()`),
          ]),
          eb.and([
            eb('status', '=', 'cancelled'),
            eb.exists(
              eb
                .selectFrom('agent_model_attempts')
                .select('id')
                .whereRef('agent_model_attempts.run_id', '=', 'agent_runs.id')
                .whereRef('agent_model_attempts.workspace_id', '=', 'agent_runs.workspace_id')
                .where('outcome', '=', 'dispatched')
                .where(
                  'deadline_at',
                  '<=',
                  sql<Date>`clock_timestamp() - ${grace} * interval '1 second'`,
                ),
            ),
          ]),
        ]),
      );
    if (this.workspaceId) selection = selection.where('workspace_id', '=', this.workspaceId);
    const rows = await selection
      .groupBy('workspace_id')
      .orderBy('due')
      .orderBy('workspace_id')
      .limit(policy.agent.recovery_batch_size)
      .execute();
    return rows.map((row) => row.workspace_id);
  }
  async runOnce() {
    const workspaces = await this.workspaces(),
      { queue, runtime, models, settings } = this.dependencies;
    await queue.recover(workspaces, policy.agent.recovery_batch_size, (db, run) =>
      models.reconcile(db, run),
    );
    await models.recoverCancelled(
      workspaces,
      policy.agent.recovery_batch_size,
      settings.leaseMarginSeconds,
    );
    return Number(
      await runAgentOnce(queue, runtime, this.owner, workspaces, (attempt) =>
        Math.min(
          settings.retryMaxSeconds,
          settings.retryBaseSeconds * 2 ** Math.max(0, attempt - 1),
        ),
      ),
    );
  }
  async runUntilIdle(maxBatches = policy.task_queue.max_drain_batches) {
    let total = 0;
    for (let batch = 0; batch < maxBatches; batch++) {
      const ran = await this.runOnce();
      total += ran;
      if (!ran) break;
    }
    return total;
  }
  async runForever(signal: AbortSignal) {
    logger.info('agent worker started', { owner: this.owner });
    while (!signal.aborted) {
      try {
        if (await this.runOnce()) continue;
      } catch (error) {
        logger.exception('agent worker loop iteration failed', error);
      }
      await waitForPoll(policy.agent.worker_poll_seconds * 1000, signal);
    }
    logger.info('agent worker stopped', { owner: this.owner });
  }
}
