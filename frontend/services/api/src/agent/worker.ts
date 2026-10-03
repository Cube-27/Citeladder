import { agentPolicy, AgentError } from './contracts.ts';
import { AgentQueue } from './queue.ts';
import { AgentRuntime } from './runtime.ts';
import { maintainLease } from '../queue/heartbeat.ts';
import { getLogger } from '../logging.ts';

/** One bounded turn; the process owner handles recovery and drain policy. */
export async function runAgentOnce(
  queue: AgentQueue,
  runtime: AgentRuntime,
  owner: string,
  workspaceIds: readonly string[],
  retryDelay: (attempt: number) => number,
) {
  const claimed = await queue.claim(owner, workspaceIds);
  if (!claimed) return false;
  let lease;
  try {
    lease = await queue.start(claimed, owner);
  } catch (error) {
    getLogger('workers.agent').exception('agent_start_failed', error, { run_id: claimed.id });
    return true;
  }
  const heartbeat = maintainLease(
    () => queue.heartbeat(lease),
    agentPolicy.heartbeat_seconds * 1000,
  );
  try {
    await runtime.execute(lease, heartbeat.signal);
  } catch (error) {
    if (heartbeat.signal.aborted) return true;
    if (!(error instanceof AgentError && error.retryable)) throw error;
    await queue.retry(lease, retryDelay(lease.attempt), (db, run) =>
      runtime.deps.models.reconcile(db, run),
    );
  } finally {
    await heartbeat.stop();
  }
  return true;
}
