import type { NotNull } from 'kysely';
import { settleProviderCredits } from '../billing/metering.ts';
import type { Database } from '../db/database.ts';
import { getLogger } from '../logging.ts';
import { si, usdUnits } from './requests.ts';

const logger = getLogger('workers.research');
const ENDED = ['succeeded', 'failed', 'partial', 'cancelled', 'uncertain'];

const microusd = (value: string) => Math.ceil(usdUnits(value) / 100);

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
      .select(['provider_reported_cost_usd', 'error_code'])
      .where('workspace_id', '=', run.workspaceId)
      .where('run_id', '=', run.runId)
      .where('dispatched_at', 'is not', null)
      .$narrowType<{ dispatched_at: NotNull }>()
      .execute();
    // A request may still report its cost until its timeout has passed twice over,
    // including one recovery marked uncertain while its sender may still be waiting
    // (B41 bills that late receipt). A sender that saw its own connection fail waits for nothing.
    const settledBy = at.getTime() - 2 * si.provider_timeout_seconds * 1000;
    const awaited = (call: (typeof sent)[number]) =>
      call.status === 'dispatched' ||
      (call.status === 'uncertain' && call.error_code === 'provider_result_missing');
    if (
      sent.some(
        (call) =>
          awaited(call) &&
          call.sanitized_response === null &&
          call.dispatched_at.getTime() > settledBy,
      )
    )
      return null;
    const cost = sent
      .filter((call) => call.sanitized_response !== null && call.status !== 'failed')
      .reduce(
        (sum, call) => sum + microusd(call.provider_reported_cost_usd ?? call.estimated_cost_usd),
        0,
      );
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
    const key = { workspaceId: run.workspace_id, runId: run.id };
    try {
      if (await settleResearchCharge(db, key, at)) settled++; // NOSONAR -- One run per transaction, each under its own lock.
    } catch (error) {
      logger.exception('research_charge_settlement_failed', error, { run_id: run.id });
    }
  }
  return settled;
}
