import { randomUUID } from 'node:crypto';
import { asApiErrorCode } from '@citeladder/contracts/error-codes';
import { recordSecurityEvent } from '../auth/security-events.ts';
import { changeKinds } from '../changes/kinds.ts';
import type { ServiceConfig } from '../config.ts';
import type { Database } from '../db/database.ts';
import { ApiError, notFound } from '../errors.ts';
import { isAgentChangeKind, memberActor, storedProposals } from './change-proposals.ts';
import { workspaceChat } from './messages.ts';
import type { Scope } from './contracts.ts';

export type ProposalRef = Readonly<{ chatId: string; messageId: string; index: number }>;
type Decision = 'confirm' | 'dismiss';

async function proposalAt(trx: Database, scope: Pick<Scope, 'workspaceId'>, ref: ProposalRef) {
  const chat = await workspaceChat(trx, scope.workspaceId, ref.chatId);
  const message = await trx
    .selectFrom('agent_messages')
    .select(['id', 'proposals'])
    .where('workspace_id', '=', scope.workspaceId)
    .where('chat_id', '=', chat.id)
    .where('id', '=', ref.messageId)
    .where('role', '=', 'agent')
    .executeTakeFirst();
  const proposal = message ? storedProposals.parse(message.proposals)[ref.index] : undefined;
  if (proposal?.kind !== 'change' || !isAgentChangeKind(proposal.change))
    throw notFound('Proposal');
  return { chat, kind: proposal.change, payload: proposal.payload };
}

export function decideProposal(
  db: Database,
  config: ServiceConfig,
  input: Readonly<{
    scope: Pick<Scope, 'workspaceId' | 'userId'>;
    ref: ProposalRef;
    decision: Decision;
  }>,
) {
  const { scope, ref, decision } = input;
  return db.transaction().execute(async (trx) => {
    const actor = await memberActor(trx, scope, 'share');
    const { chat, kind, payload } = await proposalAt(trx, scope, ref);
    const recorded = await trx
      .insertInto('agent_proposal_outcomes')
      .values({
        id: randomUUID(),
        workspace_id: chat.workspace_id,
        project_id: chat.project_id,
        chat_id: chat.id,
        message_id: ref.messageId,
        proposal_index: ref.index,
        state: decision === 'confirm' ? 'executed' : 'dismissed',
        user_id: scope.userId,
        created_at: new Date(),
      })
      .onConflict((conflict) => conflict.columns(['message_id', 'proposal_index']).doNothing())
      .returning('id')
      .executeTakeFirst();
    if (!recorded)
      throw new ApiError(409, 'This change was already confirmed or dismissed.', {
        code: asApiErrorCode('agent_proposal_decided'),
      });
    if (decision === 'dismiss') return;
    const change = { id: recorded.id, projectId: chat.project_id };
    await changeKinds[kind].confirm(trx, config, actor, change, payload);
    await recordSecurityEvent(
      trx,
      `agent.change.${kind}`,
      scope.userId,
      chat.workspace_id,
      chat.project_id,
    );
  });
}
