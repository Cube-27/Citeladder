import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import type { Database } from '../db/database.ts';
import { notFound } from '../errors.ts';
import { jsonObject } from '../db/json.ts';
import { authorize } from './access.ts';
import {
  agentPolicy,
  AgentError,
  admittedBudget,
  type Chat,
  type Run,
  type Scope,
  type SkillCatalog,
  type Json,
} from './contracts.ts';
import { buildManifest, type ContextReader } from './context.ts';
import { active, terminal } from './queue.ts';

export type FundingIdentity = Pick<
  Run,
  | 'funding_source'
  | 'requested_model'
  | 'route_id'
  | 'connection_id'
  | 'route_revision'
  | 'credential_revision'
>;
/** Admission owns capability, route selection and abuse capacity, in this transaction.
 * Required injection deliberately has no unmetered/platform fallback. */
export type Admission = (db: Database, scope: Scope) => Promise<FundingIdentity>;
const messageSchema = z.string().trim().min(1).max(agentPolicy.message_max_chars);
export type TurnInput = {
  chatId?: string;
  message: string;
  key: string;
  skillId?: string | null;
  actionId?: string;
  refs?: Record<string, Json>;
  mentionIds?: string[];
};

export async function getChat(db: Database, scope: Scope, id: string, lock = false): Promise<Chat> {
  let query = db
    .selectFrom('agent_chats')
    .selectAll()
    .where('id', '=', id)
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId);
  if (lock) query = query.forUpdate();
  const chat = await query.executeTakeFirst();
  if (!chat) throw notFound('Chat');
  return chat;
}
export async function requireIdle(db: Database, chat: Chat) {
  const run = await db
    .selectFrom('agent_runs')
    .select('id')
    .where('workspace_id', '=', chat.workspace_id)
    .where('chat_id', '=', chat.id)
    .where('status', 'in', active)
    .executeTakeFirst();
  if (run) throw new AgentError('agent_run_active');
}
export async function appendMessage(
  db: Database,
  chat: Chat,
  input: {
    role: 'user' | 'agent';
    content: string;
    userId?: string;
    replyTo?: string;
    skillId?: string | null;
    skillSource?: string | null;
    evidence?: string[];
    steps?: Json[];
    mentions?: Json[];
  },
) {
  const previous = await db
    .selectFrom('agent_messages')
    .select(sql<number>`coalesce(max(sequence), 0)`.as('last'))
    .where('workspace_id', '=', chat.workspace_id)
    .where('chat_id', '=', chat.id)
    .executeTakeFirstOrThrow();
  return db
    .insertInto('agent_messages')
    .values({
      id: randomUUID(),
      workspace_id: chat.workspace_id,
      project_id: chat.project_id,
      chat_id: chat.id,
      sequence: previous.last + 1,
      role: input.role,
      content: input.content,
      author_user_id: input.userId ?? null,
      reply_to_message_id: input.replyTo ?? null,
      skill_id: input.skillId ?? null,
      skill_source: input.skillSource ?? null,
      evidence_refs: JSON.stringify(input.evidence ?? []),
      steps: JSON.stringify(input.steps ?? []),
      mentions: JSON.stringify(input.mentions ?? []),
      created_at: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}
// Hash canonical JSON to bind nested refs as well as the visible message.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function fingerprint(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}

function requestIdentity(scope: Scope, input: TurnInput, mode: string, approvalRevision?: string) {
  if (approvalRevision)
    return { op: 'approve_outline', chat: input.chatId, revision: approvalRevision, mode };
  if (input.chatId)
    return {
      op: 'send_message',
      chat: input.chatId,
      content: input.message,
      mode,
      skill: input.skillId === undefined ? { mode: 'inherit' } : input.skillId,
      mentions: input.mentionIds ?? [],
    };
  return {
    op: 'create_chat',
    project: scope.projectId,
    content: input.message,
    mode,
    skill: input.skillId === undefined ? { mode: 'inherit' } : input.skillId,
    action: input.actionId ?? null,
    context: input.refs ?? {},
    mentions: input.mentionIds ?? [],
  };
}
function skillSource(
  explicit: string | null | undefined,
  pinned: string | null,
  id: string | null,
) {
  if (explicit) return 'user';
  if (pinned && explicit !== null) return 'chat';
  return id ? 'action' : null;
}

export class AgentStore {
  readonly db: Database;
  readonly dependencies: {
    admission: Admission;
    context: ContextReader;
    catalog: SkillCatalog;
    registryVersion: string;
    timeoutSeconds: number;
  };
  constructor(db: Database, dependencies: AgentStore['dependencies']) {
    this.db = db;
    this.dependencies = dependencies;
  }
  enqueue(scope: Scope, input: TurnInput) {
    return this.submit(scope, input);
  }
  approveOutline(scope: Scope, chatId: string, revisionId: string, key: string) {
    return this.submit(
      scope,
      { chatId, message: 'Use the approved outline and write the draft.', key },
      revisionId,
    );
  }
  private submit(scope: Scope, raw: TurnInput, approvalRevision?: string): Promise<Run> {
    const input = { ...raw, message: messageSchema.parse(raw.message) };
    z.string().trim().min(1).max(agentPolicy.idempotency_key_max_chars).parse(input.key);
    const mode = approvalRevision ? 'draft_from_outline' : 'turn';
    const hash = fingerprint(requestIdentity(scope, input, mode, approvalRevision));
    const lockKey = 'agent-enqueue:' + scope.workspaceId;
    return this.db.transaction().execute(async (trx) => {
      await authorize(trx, scope);
      // Serialize workspace keys before chat locks: identical races share the winner.
      await sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`.execute(trx);
      const replay = await trx
        .selectFrom('agent_runs')
        .selectAll()
        .where('workspace_id', '=', scope.workspaceId)
        .where('idempotency_key', '=', input.key)
        .executeTakeFirst();
      if (replay) {
        if (replay.project_id !== scope.projectId) throw notFound('Run');
        if (replay.user_id !== scope.userId) throw new AgentError('agent_idempotency_conflict');
        // Python hashes escaped JSON. Reusing that key requires its original runtime;
        // never interpret it as a TypeScript hash, even for an ASCII-only request.
        if (replay.runtime_version !== agentPolicy.runtime_version)
          throw new AgentError('agent_legacy_replay');
        if (replay.request_fingerprint !== hash) throw new AgentError('agent_idempotency_conflict');
        return replay;
      }
      const chat = input.chatId
        ? await getChat(trx, scope, input.chatId, true)
        : await this.createChat(trx, scope, input);
      if (chat.archived_at) throw notFound('Chat');
      await requireIdle(trx, chat);
      if (chat.turn_count >= agentPolicy.chat_turn_limit) throw new AgentError('agent_turn_limit');
      const funding = await this.dependencies.admission(trx, scope);
      z.enum(['platform', 'customer_byok', 'development']).parse(funding.funding_source);
      const refs = z
        .record(z.string(), z.json())
        .parse(jsonObject(chat.context_refs, 'agent_chats.context_refs'));
      const manifest = await buildManifest(
        trx,
        scope,
        {
          refs,
          request: input.message,
          actionId: chat.action_id,
          mentionIds: input.mentionIds ?? [],
        },
        this.dependencies.context,
      );
      const skill = await this.turnSkill(
        trx,
        chat,
        input.skillId,
        manifest.action?.skill_id ?? null,
      );
      if (approvalRevision) await this.approveRevision(trx, scope, chat, approvalRevision);
      const message = await appendMessage(trx, chat, {
        role: 'user',
        content: input.message,
        userId: scope.userId,
        skillId: input.skillId,
        skillSource: input.skillId ? 'user' : input.skillId === null ? 'automatic' : null,
        mentions: manifest.mentions.map((action) => ({
          kind: 'action',
          id: action.id,
          label: action.target_label,
        })),
      });
      const now = new Date();
      const run = await trx
        .insertInto('agent_runs')
        .values({
          id: randomUUID(),
          workspace_id: scope.workspaceId,
          project_id: scope.projectId,
          chat_id: chat.id,
          user_message_id: message.id,
          user_id: scope.userId,
          idempotency_key: input.key,
          request_fingerprint: hash,
          mode,
          requested_skill_id: skill.id,
          requested_skill_source: skill.source,
          context_manifest: manifest,
          budget: admittedBudget(this.dependencies.timeoutSeconds),
          runtime_version: agentPolicy.runtime_version,
          protocol_version: agentPolicy.protocol_version,
          registry_version: this.dependencies.registryVersion,
          skill_catalog_version: this.dependencies.catalog.version,
          ...funding,
          max_attempts: agentPolicy.run_max_attempts,
          status: 'queued',
          priority: 0,
          randomized_position: 0,
          attempt_count: 0,
          available_at: sql<Date>`clock_timestamp()`,
          lease_owner: null,
          lease_expires_at: null,
          heartbeat_at: null,
          error_code: '',
          error_detail: '',
          created_at: now,
          updated_at: now,
          completed_at: null,
          skill_id: null,
          skill_source: null,
          skill_version: null,
          steps_used: 0,
          cancelled_at: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await trx
        .updateTable('agent_chats')
        .set({
          turn_count: chat.turn_count + 1,
          pinned_skill_id: input.skillId === undefined ? chat.pinned_skill_id : input.skillId,
          last_activity_at: now,
          updated_at: now,
        })
        .where('id', '=', chat.id)
        .where('workspace_id', '=', scope.workspaceId)
        .execute();
      return run;
    });
  }
  private async approveRevision(db: Database, scope: Scope, chat: Chat, revisionId: string) {
    const latest = await db
      .selectFrom('agent_output_revisions as revision')
      .innerJoin('agent_outputs as output', (join) =>
        join
          .onRef('output.id', '=', 'revision.output_id')
          .onRef('output.workspace_id', '=', 'revision.workspace_id'),
      )
      .selectAll('revision')
      .where('output.workspace_id', '=', scope.workspaceId)
      .where('output.chat_id', '=', chat.id)
      .orderBy('revision.number', 'desc')
      .limit(1)
      .executeTakeFirst();
    if (latest?.id !== revisionId || latest.phase !== 'outline')
      throw new AgentError('agent_outline_not_approvable');
    await db
      .updateTable('agent_output_revisions')
      .set({
        approved_at: latest.approved_at ?? new Date(),
        approved_by_user_id: latest.approved_by_user_id ?? scope.userId,
      })
      .where('id', '=', revisionId)
      .where('workspace_id', '=', scope.workspaceId)
      .execute();
  }
  archive(scope: Scope, chatId: string) {
    return this.db.transaction().execute(async (trx) => {
      await authorize(trx, scope);
      const chat = await getChat(trx, scope, chatId, true);
      await requireIdle(trx, chat);
      await trx
        .updateTable('agent_chats')
        .set({ archived_at: new Date(), updated_at: new Date() })
        .where('id', '=', chat.id)
        .where('workspace_id', '=', scope.workspaceId)
        .execute();
    });
  }
  private createChat(db: Database, scope: Scope, input: TurnInput) {
    const now = new Date();
    return db
      .insertInto('agent_chats')
      .values({
        id: randomUUID(),
        workspace_id: scope.workspaceId,
        project_id: scope.projectId,
        created_by_user_id: scope.userId,
        title: input.message.slice(0, agentPolicy.chat_title_max_chars),
        action_id: input.actionId ?? null,
        context_refs: input.refs ?? {},
        pinned_skill_id: input.skillId ?? null,
        turn_count: 0,
        created_at: now,
        updated_at: now,
        last_activity_at: now,
        archived_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }
  private async turnSkill(
    db: Database,
    chat: Chat,
    explicit: string | null | undefined,
    actionSkill: string | null,
  ) {
    const catalog = this.dependencies.catalog.skills;
    let id =
      explicit ??
      (explicit === null ? null : chat.pinned_skill_id) ??
      (actionSkill && catalog.has(actionSkill) ? actionSkill : null);
    let source = skillSource(explicit, chat.pinned_skill_id, id);
    if (id && !catalog.has(id)) throw new AgentError('protocol_violation');
    const output = await db
      .selectFrom('agent_outputs')
      .select(['kind', 'skill_id'])
      .where('workspace_id', '=', chat.workspace_id)
      .where('chat_id', '=', chat.id)
      .executeTakeFirst();
    if (output && id && catalog.get(id)?.outputKind !== output.kind) {
      if (explicit) throw new AgentError('agent_skill_kind_conflict');
      id = output.skill_id;
      source = 'chat';
    }
    return { id, source };
  }
  cancel(scope: Scope, chatId: string, runId: string) {
    return this.db.transaction().execute(async (trx) => {
      await authorize(trx, scope);
      const run = await trx
        .selectFrom('agent_runs')
        .selectAll()
        .where('workspace_id', '=', scope.workspaceId)
        .where('project_id', '=', scope.projectId)
        .where('chat_id', '=', chatId)
        .where('id', '=', runId)
        .forUpdate()
        .executeTakeFirst();
      if (!run) throw notFound('Run');
      if (terminal.includes(run.status)) return;
      await trx
        .updateTable('agent_runs')
        .set({
          status: 'cancelled',
          cancelled_at: new Date(),
          completed_at: new Date(),
          error_code: 'cancelled',
          updated_at: new Date(),
          lease_owner: null,
          lease_expires_at: null,
        })
        .where('id', '=', run.id)
        .where('workspace_id', '=', scope.workspaceId)
        .execute();
    });
  }
}
