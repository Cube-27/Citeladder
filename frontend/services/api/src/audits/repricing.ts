import type { Database } from '../db/database.ts';
import { appendCostProjection, costPolicy } from './costs.ts';

type RepricingRequest = {
  formulaVersion: string;
  pricingVersion: string;
  artifactIds?: string[];
  workspaceId?: string;
  dryRun: boolean;
};
/** Operator-selected persisted artifacts; every append uses its authorized workspace and honest version pair. */
export async function repriceExecutions(db: Database, request: RepricingRequest) {
  if (request.formulaVersion !== costPolicy.formula_version)
    throw new Error('Requested formula is not computed by this build');
  if (!Object.hasOwn(costPolicy.catalogs, request.pricingVersion))
    throw new Error('Requested pricing version is not catalogued');
  let query = db
    .selectFrom('raw_response_artifacts as r')
    .innerJoin('audits as a', 'a.id', 'r.audit_id')
    .select(['r.id', 'a.workspace_id'])
    .orderBy('r.created_at')
    .orderBy('r.id');
  if (request.workspaceId) query = query.where('a.workspace_id', '=', request.workspaceId);
  if (request.artifactIds) query = query.where('r.id', 'in', [...new Set(request.artifactIds)]);
  const candidates = await query.execute();
  let alreadyProjected = 0,
    appended = 0,
    wouldAppend = 0;
  for (const artifact of candidates) {
    const exists = await db
      .selectFrom('execution_cost_projections')
      .select('id')
      .where('raw_response_artifact_id', '=', artifact.id)
      .where('formula_version', '=', request.formulaVersion)
      .where('pricing_version', '=', request.pricingVersion)
      .executeTakeFirst();
    if (exists) {
      alreadyProjected++;
      continue;
    }
    wouldAppend++;
    if (!request.dryRun) {
      const result = await db
        .transaction()
        .execute((trx) =>
          appendCostProjection(
            trx,
            artifact.workspace_id,
            artifact.id,
            request.pricingVersion,
            request.formulaVersion,
          ),
        );
      if (result) appended++;
    }
  }
  return {
    candidates: candidates.length,
    alreadyProjected,
    appended,
    wouldAppend,
    dryRun: request.dryRun,
  };
}
