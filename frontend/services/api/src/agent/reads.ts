import { z } from 'zod';
import { sql } from 'kysely';
import {
  agentChatDetailSchema,
  agentChatSummarySchema,
  agentChatsPageSchema,
  agentMessageSchema,
  agentOutputSchema,
  agentRevisionSchema,
  agentRevisionsPageSchema,
  agentRunSchema,
  agentRunStepSchema,
} from '@citeladder/contracts/agent';
import type { Database } from '../db/database.ts';
import { jsonObject } from '../db/json.ts';
import { authorize } from './access.ts';
import { agentPolicy, type Chat, type Run, type Scope } from './contracts.ts';
import { currentOutput, revisionRefs } from './outputs.ts';
import { active } from './queue.ts';
import { getChat } from './store.ts';

const iso = (date: Date | null) => date?.toISOString() ?? null;
function summary(chat: Chat, output: { kind: string; phase: string } | null, label: string | null) {
  return agentChatSummarySchema.parse({
    ...chat,
    target_label: label,
    output_kind: output?.kind ?? null,
    output_phase: output?.phase ?? null,
    last_activity_at: iso(chat.last_activity_at),
    created_at: iso(chat.created_at),
  });
}
export async function progress(db: Database, run: Run) {
  if (!active.includes(run.status) || run.attempt_count < 1) return [];
  const attempts = await db
    .selectFrom('agent_model_attempts as model')
    .leftJoin('agent_tool_attempts as tool', (join) =>
      join
        .onRef('tool.run_id', '=', 'model.run_id')
        .onRef('tool.workspace_id', '=', 'model.workspace_id')
        .onRef('tool.run_attempt', '=', 'model.run_attempt')
        .onRef('tool.ordinal', '=', 'model.ordinal'),
    )
    .select([
      'model.id as model_id',
      'model.ordinal',
      'model.outcome',
      'tool.id as tool_id',
      'tool.tool_name',
      'tool.status as tool_status',
      'tool.registry_version',
    ])
    .where('model.workspace_id', '=', run.workspace_id)
    .where('model.run_id', '=', run.id)
    .where('model.run_attempt', '=', run.attempt_count)
    .orderBy('model.ordinal')
    .execute();
  return attempts.map((row, index) =>
    agentRunStepSchema.parse({
      ordinal: row.ordinal,
      status:
        row.tool_status ??
        (row.outcome === 'dispatched'
          ? 'working'
          : row.outcome === 'completed'
            ? index === attempts.length - 1
              ? 'processing'
              : 'reasoned'
            : row.outcome),
      tool: row.tool_name,
      model_attempt_id: row.model_id,
      tool_attempt_id: row.tool_id,
      run_attempt: run.attempt_count,
      runtime_version: run.runtime_version,
      protocol_version: run.protocol_version,
      registry_version: row.registry_version ?? run.registry_version,
      skill_catalog_version: run.skill_catalog_version,
      projection_version: agentPolicy.progress_version,
    }),
  );
}
export async function readChat(db: Database, scope: Scope, chatId: string) {
  await authorize(db, scope, false);
  const chat = await getChat(db, scope, chatId);
  const messages = await db
    .selectFrom('agent_messages')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('chat_id', '=', chat.id)
    .orderBy('sequence')
    .execute();
  const run = await db
    .selectFrom('agent_runs')
    .selectAll()
    .where('workspace_id', '=', scope.workspaceId)
    .where('chat_id', '=', chat.id)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .limit(1)
    .executeTakeFirst();
  const current = await currentOutput(db, chat);
  const action = chat.action_id
    ? await db
        .selectFrom('actions')
        .select('target_label')
        .where('workspace_id', '=', scope.workspaceId)
        .where('project_id', '=', scope.projectId)
        .where('id', '=', chat.action_id)
        .executeTakeFirst()
    : undefined;
  return agentChatDetailSchema.parse({
    chat: summary(chat, current.output, action?.target_label ?? null),
    pinned_skill_id: chat.pinned_skill_id,
    context: run ? jsonObject(run.context_manifest, 'agent_runs.context_manifest') : {},
    messages: messages.map((message) =>
      agentMessageSchema.parse({
        ...message,
        created_at: iso(message.created_at),
        evidence_refs: revisionRefs(message.evidence_refs),
      }),
    ),
    latest_run: run
      ? agentRunSchema.parse({
          ...run,
          created_at: iso(run.created_at),
          completed_at: iso(run.completed_at),
          progress: await progress(db, run),
        })
      : null,
    output: current.output
      ? agentOutputSchema.parse({
          ...current.output,
          latest_revision: current.revision
            ? agentRevisionSchema.parse({
                ...current.revision,
                source_refs: revisionRefs(current.revision.source_refs),
                created_at: iso(current.revision.created_at),
                approved_at: iso(current.revision.approved_at),
              })
            : null,
        })
      : null,
  });
}
const cursorSchema = z.object({ at: z.iso.datetime({ offset: true }), id: z.uuid() });
export async function listRevisions(db: Database, scope: Scope, chatId: string) {
  await authorize(db, scope, false);
  const chat = await getChat(db, scope, chatId);
  const current = await currentOutput(db, chat);
  const revisions = current.output
    ? await db
        .selectFrom('agent_output_revisions')
        .selectAll()
        .where('workspace_id', '=', scope.workspaceId)
        .where('project_id', '=', scope.projectId)
        .where('output_id', '=', current.output.id)
        .orderBy('number', 'desc')
        .limit(agentPolicy.revision_list_max)
        .execute()
    : [];
  return agentRevisionsPageSchema.parse({
    items: revisions.map((revision) =>
      agentRevisionSchema.parse({
        ...revision,
        source_refs: revisionRefs(revision.source_refs),
        created_at: iso(revision.created_at),
        approved_at: iso(revision.approved_at),
      }),
    ),
  });
}
export async function listChats(
  db: Database,
  scope: Scope,
  options: { limit?: number; cursor?: string; actionId?: string } = {},
) {
  await authorize(db, scope, false);
  const limit = z
    .number()
    .int()
    .positive()
    .max(agentPolicy.list_max_limit)
    .parse(options.limit ?? agentPolicy.list_default_limit);
  let query = db
    .selectFrom('agent_chats as chat')
    .leftJoin('agent_outputs as output', (join) =>
      join
        .onRef('output.chat_id', '=', 'chat.id')
        .onRef('output.workspace_id', '=', 'chat.workspace_id'),
    )
    .leftJoin('actions as action', (join) =>
      join
        .onRef('action.id', '=', 'chat.action_id')
        .onRef('action.workspace_id', '=', 'chat.workspace_id')
        .onRef('action.project_id', '=', 'chat.project_id'),
    )
    .selectAll('chat')
    .select(['output.kind as output_kind', 'output.phase as output_phase', 'action.target_label'])
    .select(
      sql<string>`to_char(chat.last_activity_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
        'cursor_at',
      ),
    )
    .where('chat.workspace_id', '=', scope.workspaceId)
    .where('chat.project_id', '=', scope.projectId)
    .where('chat.archived_at', 'is', null);
  if (options.actionId) query = query.where('chat.action_id', '=', options.actionId);
  if (options.cursor) {
    const cursor = cursorSchema.parse(
      JSON.parse(Buffer.from(options.cursor, 'base64url').toString('utf8')),
    );
    const instant = sql<Date>`${cursor.at}::timestamptz`;
    query = query.where((eb) =>
      eb.or([
        eb('chat.last_activity_at', '<', instant),
        eb.and([eb('chat.last_activity_at', '=', instant), eb('chat.id', '<', cursor.id)]),
      ]),
    );
  }
  const rows = await query
    .orderBy('chat.last_activity_at', 'desc')
    .orderBy('chat.id', 'desc')
    .limit(limit + 1)
    .execute();
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return agentChatsPageSchema.parse({
    items: page.map((row) =>
      summary(
        row,
        row.output_kind ? { kind: row.output_kind, phase: row.output_phase! } : null,
        row.target_label,
      ),
    ),
    next_cursor:
      rows.length > limit && last
        ? Buffer.from(JSON.stringify({ at: last.cursor_at, id: last.id })).toString('base64url')
        : null,
  });
}
