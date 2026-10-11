/**
 * The AI-credit charge of a managed analysis (B40, B41). Confirmation held the
 * estimate; once the analysis ends it is charged the DataForSEO cost of every
 * request sent, never above the hold, and the rest is released. A request
 * DataForSEO refused with no response costs nothing; one whose outcome or cost
 * is unknown costs its estimate.
 */
import type { NotNull } from 'kysely';
import { settleProviderCredits } from '../billing/metering.ts';
import type { Database } from '../db/database.ts';
import { si, usdUnits } from './requests.ts';

const ENDED = ['succeeded', 'failed', 'partial', 'cancelled', 'uncertain'];

/** A stored USD amount as whole micro-USD, rounded up. */
const microusd = (value: string) => Math.ceil(usdUnits(value) / 100);

/** Settles one ended analysis's hold and returns the run; null while it runs, a request is in flight, or it is settled. */
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
    if (!locked?.platform_call_id || !ENDED.includes(locked.status)) return null;
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
      return null;
    const cost = sent.reduce((sum, call) => {
      if (call.provider_reported_cost_usd !== null)
        return sum + microusd(call.provider_reported_cost_usd);
      const refused = call.status === 'failed' && call.sanitized_response === null;
      return refused ? sum : sum + microusd(call.estimated_cost_usd);
    }, 0);
    const credits = await settleProviderCredits(trx, locked.platform_call_id, cost);
    if (credits === null) return null;
    return trx
      .updateTable('search_intelligence_runs')
      .set({ charged_credits: credits, updated_at: at })
      .where('workspace_id', '=', run.workspaceId)
      .where('id', '=', run.runId)
      .returningAll()
      .executeTakeFirstOrThrow();
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
