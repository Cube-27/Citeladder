/**
 * The AI-credit charge of a managed analysis (B40, B41). Confirmation held the
 * estimate; once the analysis ends it is charged the DataForSEO cost of every
 * request sent, never above the hold, and the rest is released. A request
 * DataForSEO refused outright costs nothing; one whose outcome or cost is
 * unknown costs its estimate.
 */
import type { NotNull } from 'kysely';
import { settleProviderCredits } from '../billing/metering.ts';
import type { Database } from '../db/database.ts';
import { si } from './requests.ts';

const ENDED = ['succeeded', 'failed', 'partial', 'cancelled', 'uncertain'];

/** A decimal USD amount as whole micro-USD, rounded up; exact for the stored scale. */
function microusd(value: string) {
  const [whole = '0', fraction = ''] = value.trim().split('.');
  const units = BigInt(whole || '0') * 100_000_000n + BigInt(fraction.padEnd(8, '0').slice(0, 8));
  return Number((units + 99n) / 100n);
}

/** Settles one ended analysis's hold; false while it runs, a request is in flight, or it is settled. */
export function settleResearchCharge(
  db: Database,
  run: { workspaceId: string; runId: string },
  at = new Date(),
) {
  return db.transaction().execute(async (trx) => {
    const locked = await trx
      .selectFrom('search_intelligence_runs')
      .selectAll()
      .where('workspace_id', '=', run.workspaceId)
      .where('id', '=', run.runId)
      .forUpdate()
      .executeTakeFirst();
    if (!locked?.platform_call_id || !ENDED.includes(locked.status)) return false;
    const sent = await trx
      .selectFrom('search_intelligence_calls')
      .select(['status', 'dispatched_at', 'sanitized_response', 'estimated_cost_usd'])
      .select('provider_reported_cost_usd')
      .where('workspace_id', '=', run.workspaceId)
      .where('run_id', '=', run.runId)
      .where('dispatched_at', 'is not', null)
      .$narrowType<{ dispatched_at: NotNull }>()
      .execute();
    // A request may still report its cost until its timeout has passed twice over.
    const settledBy = at.getTime() - 2 * si.provider_timeout_seconds * 1000;
    if (
      sent.some(
        (call) =>
          call.status === 'dispatched' &&
          call.sanitized_response === null &&
          call.dispatched_at.getTime() > settledBy,
      )
    )
      return false;
    const cost = sent.reduce((sum, call) => {
      if (call.provider_reported_cost_usd !== null)
        return sum + microusd(call.provider_reported_cost_usd);
      return call.status === 'failed' ? sum : sum + microusd(call.estimated_cost_usd);
    }, 0);
    const credits = await settleProviderCredits(trx, locked.platform_call_id, cost);
    if (credits === null) return false;
    await trx
      .updateTable('search_intelligence_runs')
      .set({ charged_credits: credits, updated_at: at })
      .where('workspace_id', '=', run.workspaceId)
      .where('id', '=', run.runId)
      .execute();
    return true;
  });
}

/** Settles ended managed analyses whose holds are still open; the research-recovery lane runs it. */
export async function settleResearchCharges(db: Database, at = new Date(), canAdmit = () => true) {
  if (!canAdmit()) return 0;
  const open = await db
    .selectFrom('search_intelligence_runs as r')
    .innerJoin('platform_calls as p', 'p.id', 'r.platform_call_id')
    .select(['r.workspace_id', 'r.id'])
    .where('p.status', '=', 'reserved')
    .where('r.status', 'in', ENDED)
    .orderBy('r.updated_at')
    .limit(si.maintenance_batch_size)
    .execute();
  let settled = 0;
  for (const run of open) {
    if (!canAdmit()) break;
    // One run per transaction, each under its own lock.
    const key = { workspaceId: run.workspace_id, runId: run.id };
    if (await settleResearchCharge(db, key, at)) settled++; // NOSONAR
  }
  return settled;
}
