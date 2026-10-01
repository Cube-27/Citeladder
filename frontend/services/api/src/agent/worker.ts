import { agentPolicy, AgentError } from './contracts.ts';
import { AgentQueue } from './queue.ts';
import { AgentRuntime } from './runtime.ts';

/** Bounded worker unit, deliberately absent from compose/CLI/ingress in 19a. */
export async function runAgentOnce(
  queue: AgentQueue,
  runtime: AgentRuntime,
  owner: string,
  workspaceIds: readonly string[],
  retryDelay: (attempt: number) => number,
) {
  const claimed = await queue.claim(owner, workspaceIds);
  if (!claimed) return false;
  const lease = await queue.start(claimed, owner);
  let heartbeat: Promise<boolean> | undefined;
  const timer = setInterval(() => {
    // One renewal at a time. Failure leaves the existing lease to expire.
    if (!heartbeat)
      heartbeat = queue
        .heartbeat(lease)
        .catch(() => false)
        .finally(() => {
          heartbeat = undefined;
        });
  }, agentPolicy.heartbeat_seconds * 1000);
  try {
    await runtime.execute(lease);
  } catch (error) {
    if (!(error instanceof AgentError && error.retryable)) throw error;
    await queue.retry(lease, retryDelay(lease.attempt), (db, run) =>
      runtime.deps.models.reconcile(db, run),
    );
  } finally {
    clearInterval(timer);
    await heartbeat;
  }
  return true;
}
