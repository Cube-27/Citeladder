import type { AgentRun } from '@/lib/api/agent';

const ACTIVE_STATUSES = new Set<AgentRun['status']>(['queued', 'leased', 'running', 'retry_wait']);

/** A turn the server may still be working on; the UI polls until it ends. */
export function isRunActive(run: AgentRun | null | undefined): boolean {
  return run ? ACTIVE_STATUSES.has(run.status) : false;
}

export type RunOutcome =
  | { kind: 'none' }
  | { kind: 'running'; queued: boolean }
  | { kind: 'succeeded' }
  | { kind: 'cancelled' }
  | { kind: 'stopped_at_limit'; detail: string }
  | { kind: 'failed'; code: string; detail: string };

/** The one state the conversation shows for the latest run. */
export function runOutcome(run: AgentRun | null | undefined): RunOutcome {
  if (!run) return { kind: 'none' };
  if (isRunActive(run)) return { kind: 'running', queued: run.status === 'queued' };
  if (run.status === 'succeeded') return { kind: 'succeeded' };
  if (run.status === 'cancelled') return { kind: 'cancelled' };
  if (run.error_code === 'stopped_at_limit')
    return { kind: 'stopped_at_limit', detail: run.error_detail };
  return { kind: 'failed', code: run.error_code, detail: run.error_detail };
}
