/** Chat and message writes shared by admission, the runtime and the queue. */
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { Database } from '../db/database.ts';
import { notFound } from '../errors.ts';
import type { Chat, Json, Run, Scope } from './contracts.ts';

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
const RECOVERY: Record<string, string> = {
  stopped_at_limit:
    'I reached this turn’s step limit before I could finish. Nothing was saved. Narrow the request and try again.',
  output_too_long:
    'The result was longer than one reply can hold, so nothing was saved. Ask for one section at a time or a shorter format.',
  context_size_limit:
    'This request and its selected evidence are too large for one turn. Remove some references or ask about one part at a time.',
  output_context_size_limit:
    'The current document is too large to revise in one turn. Revise one section at a time, or start a new chat for a shorter version.',
  skills_changed:
    'CiteLadder was updated while this request was waiting. Nothing was saved; send it again.',
  funding_unavailable:
    'This workspace has no AI credits or connected model available right now. Nothing was saved.',
  route_unavailable:
    'The connected AI model changed or is unavailable. Nothing was saved. Check Providers, then try again.',
  model_changed:
    'The AI model changed while this request was waiting. Nothing was saved; send it again.',
  capability_unavailable: 'Your plan does not include the agent. Nothing was saved.',
  provider_error:
    'The AI model did not respond after several attempts. Nothing was saved; try again in a moment.',
  max_attempts_exceeded:
    'The AI model did not respond after several attempts. Nothing was saved; try again in a moment.',
  cancelled: 'Stopped. Nothing from this turn was saved.',
  trial_expired: 'This workspace’s trial has ended, so the agent cannot run. Nothing was saved.',
  protocol_violation:
    'The AI model’s answer did not follow the required structure, so nothing was saved. Try again, or rephrase the request.',
};
const GENERIC_RECOVERY =
  'I couldn’t complete this request. Nothing was saved; your messages and existing work are still here. Try again in this chat.';
export function recoveryReply(code: string) {
  return RECOVERY[code] ?? GENERIC_RECOVERY;
}
/** Every terminal turn answers its request, so no message is left unanswered. */
export async function appendRecoveryReply(db: Database, run: Run, code: string) {
  const chat = await db
    .selectFrom('agent_chats')
    .selectAll()
    .where('workspace_id', '=', run.workspace_id)
    .where('id', '=', run.chat_id)
    .forUpdate()
    .executeTakeFirstOrThrow();
  await appendMessage(db, chat, {
    role: 'agent',
    replyTo: run.user_message_id,
    content: recoveryReply(code),
  });
  await db
    .updateTable('agent_chats')
    .set({ last_activity_at: new Date(), updated_at: new Date() })
    .where('id', '=', chat.id)
    .where('workspace_id', '=', run.workspace_id)
    .execute();
}
