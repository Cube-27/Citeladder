import { createHash, randomUUID } from 'node:crypto';

import { offeringMapSchema } from '@citeladder/contracts/project';
import { z } from 'zod';

import { agentCallLimit, enforceWorkspaceRequest } from '../abuse/usage.ts';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { record, strings } from '../db/json.ts';
import { ApiError } from '../errors.ts';
import { createModelGateway, type ModelGateway } from '../models/gateway.ts';
import { ModelError } from '../models/http.ts';
import { createJevClient, type JevClient } from '../models/jev.ts';
import { generationContext, type GenerationContext } from './generation-context.ts';
import { generateDrafts } from './generation-drafts.ts';
import { generationSetting, validateSelection, type GenerationInput } from './generation-input.ts';
import { gatedOut, judgeDrafts, selectDrafts } from './generation-quality.ts';
import { acquireProjectLock, acquirePromptSetLock } from './locks.ts';
import { scopedPromptSet } from './prompt-sets.ts';
import { listTopics } from './topics.ts';
import { candidateView } from './views.ts';

type Dependencies = { gateway: () => ModelGateway; judge: () => JevClient | null };
const defaults: Dependencies = { gateway: createModelGateway, judge: createJevClient };

async function stage(
  db: Database,
  workspaceId: string,
  context: GenerationContext,
  input: GenerationInput,
  output: Awaited<ReturnType<typeof generateDrafts>>,
  gate: Awaited<ReturnType<typeof judgeDrafts>>,
) {
  return db.transaction().execute(async (trx) => {
    await acquireProjectLock(trx, context.project.id);
    await acquirePromptSetLock(trx, context.set.id);
    const set = await scopedPromptSet(trx, workspaceId, context.set.id);
    const topics = await trx
      .selectFrom('topics')
      .select('id')
      .where('project_id', '=', set.project_id)
      .execute();
    validateSelection(input, topics);
    const now = new Date(),
      runId = randomUUID();
    await trx
      .deleteFrom('prompt_candidates')
      .where('workspace_id', '=', workspaceId)
      .where('prompt_set_id', '=', set.id)
      .where('disposition', 'in', [
        policy.prompts.candidate.pending,
        ...policy.prompts.candidate.outcomes,
      ])
      .where('expires_at', '<=', now)
      .execute();
    const tracked = await trx
      .selectFrom('prompts')
      .select('normalized_text_hash')
      .where('prompt_set_id', '=', set.id)
      .execute();
    const pending = await trx
      .selectFrom('prompt_candidates')
      .select('normalized_text_hash')
      .where('workspace_id', '=', workspaceId)
      .where('prompt_set_id', '=', set.id)
      .where('disposition', '=', 'pending')
      .execute();
    const known = new Set([...tracked, ...pending].map((row) => row.normalized_text_hash));
    const eligible = output.drafts.filter(
      (row) => !known.has(row.hash) && topics.some((topic) => topic.id === row.slot.topic_id),
    );
    const selected = selectDrafts(eligible, input.count),
      rejected = eligible.filter(gatedOut);
    const revision = context.revision;
    const evidence = {
      generator_version: policy.prompts.generation.version,
      buyer_query_policy_version: policy.prompts.generation.policy_version,
      generation_mode: revision ? 'agent_proposal' : 'model',
      requested_count: input.count,
      cohort: input.cohort,
      model_results: output.models,
      quality_gate: gate,
      candidates_generated: output.drafts.length,
      brand_context_hash: createHash('sha256')
        .update(JSON.stringify(context.context))
        .digest('hex'),
      source_artifact_ids: context.context.knowledge_base.source_artifact_ids,
      demand_snapshot_id: context.snapshot?.id ?? null,
      demand_signal_ids: context.demand.map((row) => row.id),
      demand_signal_coverage: context.snapshot?.coverage ?? {},
      ...(revision
        ? {
            agent_output_id: revision.output_id,
            agent_revision_id: revision.id,
            agent_run_id: revision.run_id,
            source_refs: revision.source_refs,
          }
        : {}),
    };
    await trx
      .insertInto('prompt_generation_runs')
      .values({
        id: runId,
        workspace_id: workspaceId,
        project_id: set.project_id,
        prompt_set_id: set.id,
        generator_version: policy.prompts.generation.version,
        request: JSON.stringify(input),
        provenance: JSON.stringify(evidence),
        created_at: now,
      })
      .execute();
    const rows = [...selected, ...rejected].map((draft) => {
      const rejected = gatedOut(draft);
      return {
        id: randomUUID(),
        workspace_id: workspaceId,
        run_id: runId,
        prompt_set_id: set.id,
        topic_id: draft.slot.topic_id,
        text: rejected ? '' : draft.text,
        normalized_text_hash: rejected ? '' : draft.hash,
        intent: draft.intent,
        buyer_stage: draft.buyer_stage,
        prompt_intent: draft.prompt_intent,
        cohort: input.cohort,
        slot_id: draft.slot.slot_id,
        evidence_refs: JSON.stringify([draft.slot.evidence_ref]),
        validation: JSON.stringify({ admission: 'passed' }),
        jev_decision: draft.decision ? JSON.stringify(draft.decision) : null,
        disposition: rejected ? 'gate_rejected' : 'pending',
        prompt_id: null,
        created_at: now,
        reviewed_at: rejected ? now : null,
        expires_at: new Date(
          now.getTime() +
            (rejected
              ? generationSetting('rejected_outcome_retention_days') * 24
              : generationSetting('candidate_retention_hours')) *
              3_600_000,
        ),
      };
    });
    const inserted = rows.length
      ? await trx.insertInto('prompt_candidates').values(rows).returningAll().execute()
      : [];
    if (output.maps.length) {
      const profile = await trx
        .selectFrom('brand_profiles')
        .selectAll()
        .where('project_id', '=', set.project_id)
        .where('workspace_id', '=', workspaceId)
        .forUpdate()
        .executeTakeFirst();
      if (profile) {
        const business = record(profile.business_context);
        const existing = z
          .object({ offerings: z.array(offeringMapSchema).default([]) })
          .parse(business.business_map ?? {}).offerings;
        const offerings = new Set(
          strings(profile.products_services).map((name) => name.toLowerCase()),
        );
        for (const suggestion of output.maps) {
          if (!offerings.has(suggestion.offering.toLowerCase())) continue;
          const index = existing.findIndex(
            (map) => map.offering.toLowerCase() === suggestion.offering.toLowerCase(),
          );
          const prior = existing[index];
          if (
            prior &&
            [prior.attributes, prior.situations, prior.audiences].some((values) => values.length)
          )
            continue;
          for (const dimension of ['attributes', 'situations', 'audiences'] as const)
            for (const entry of suggestion[dimension])
              entry.source = { ...entry.source, generation_run_id: runId };
          if (index < 0) existing.push(suggestion);
          else existing[index] = suggestion;
        }
        await trx
          .updateTable('brand_profiles')
          .set({
            business_context: JSON.stringify({
              ...business,
              business_map: { offerings: existing },
            }),
            updated_at: now,
          })
          .where('id', '=', profile.id)
          .execute();
      }
    }
    const candidates = inserted.filter((row) => row.disposition === 'pending');
    const touched = new Set(candidates.map((row) => row.topic_id));
    return {
      candidates: candidates.map((row) => candidateView(row, gate)),
      topics: (await listTopics(trx, workspaceId, set.project_id)).filter((topic) =>
        touched.has(topic.id),
      ),
      requested_count: input.count,
      dropped_duplicates:
        output.dropped + output.drafts.filter((row) => known.has(row.hash)).length,
      candidates_generated: output.drafts.length,
      quality_gate: gate,
      quality_rejected: rejected.length,
    };
  });
}

export async function generatePrompts(
  db: Database,
  workspaceId: string,
  setId: string,
  input: GenerationInput,
  dependencies: Dependencies = defaults,
) {
  const context = await generationContext(db, workspaceId, setId, input);
  try {
    const gateway = context.revision ? null : dependencies.gateway();
    if (gateway)
      await enforceWorkspaceRequest(
        db,
        workspaceId,
        agentCallLimit(
          Math.ceil(
            (input.count * generationSetting('overgenerate_factor')) /
              generationSetting('model_batch_size'),
          ) +
            1 +
            policy.prompts.generation.map_calls,
        ),
      );
    const output = await generateDrafts(context, input, gateway);
    const gate = await judgeDrafts(context, output.drafts, dependencies.judge());
    return await stage(db, workspaceId, context, input, output, gate);
  } catch (error) {
    if (!(error instanceof ModelError)) throw error;
    if (error.code === 'not_configured')
      throw new ApiError(503, 'Default model is not configured', { code: 'agent_not_configured' });
    if (error.status === 429)
      throw new ApiError(429, 'Model provider is rate limited', {
        code: 'rate_limited',
        headers: error.retryAfter ? { 'retry-after': error.retryAfter } : undefined,
      });
    throw new ApiError(502, 'Model generation failed', {
      code: error.code === 'parse' ? 'generation_unparseable' : 'agent_call_failed',
    });
  }
}
