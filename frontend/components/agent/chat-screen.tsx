'use client';

import { useParams } from 'react-router-dom';

import { Composer } from '@/components/agent/composer';
import { Conversation } from '@/components/agent/conversation';
import { OutputPane } from '@/components/agent/output-pane';
import { SkillPicker } from '@/components/agent/skill-picker';
import { useFollowLatest } from '@/components/agent/use-follow-latest';
import {
  useCancelRun,
  useChatDetail,
  useFollowUp,
  type FollowUp,
} from '@/components/agent/use-chat-turns';
import { PageLoading } from '@/components/layout/page-loading';
import { PageShell } from '@/components/layout/page-shell';
import { ProjectLink } from '@/components/layout/scoped-link';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Stack } from '@/components/ui/layout';
import { ReadError } from '@/components/ui/read-error';
import { agentHandoffHref } from '@/lib/agent/handoff';
import { isRunActive } from '@/lib/agent/run-state';
import { useAgentAccess } from '@/lib/agent/use-agent-access';
import type { AgentChatDetail } from '@/lib/api/agent';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';

/** One chat: a single thread with its output inline and the composer pinned below. */
export function ChatScreen() {
  const { chatId = '' } = useParams();
  const { activeProjectId, activeWorkspaceId } = useProjectContext();
  const workspaceId = activeWorkspaceId ?? '';
  const query = useChatDetail(workspaceId, chatId);

  if (query.isError)
    return (
      <PageShell>
        <ReadError
          error={query.error}
          fallback="This chat could not be loaded."
          onRetry={() => void query.refetch()}
          pending={query.isFetching}
        />
      </PageShell>
    );
  if (!query.data)
    return (
      <PageShell>
        <PageLoading />
      </PageShell>
    );
  if (query.data.chat.project_id !== activeProjectId)
    return (
      <PageShell>
        <Alert tone="danger">This chat belongs to another project.</Alert>
      </PageShell>
    );
  return (
    <ChatView key={`${workspaceId}:${chatId}`} detail={query.data} workspaceId={workspaceId} />
  );
}

function ChatView({
  detail,
  workspaceId,
}: Readonly<{ detail: AgentChatDetail; workspaceId: string }>) {
  const chatId = detail.chat.id;
  const access = useAgentAccess();
  const canEdit = useWorkspaceCapability('run');
  const runActive = isRunActive(detail.latest_run);
  const hasOutput = Boolean(detail.output?.latest_revision);
  const turn = useFollowUp(workspaceId, detail);
  const cancel = useCancelRun(workspaceId, chatId);
  const { endRef, showJump, jumpToLatest } = useFollowLatest(detail);

  return (
    <PageShell
      measure="workflow"
      // Fill the viewport below the shell chrome so the composer sits at the
      // bottom of a short thread. `--route-chrome-height` (globals.css) owns the
      // chrome above the route at each breakpoint; the gutter is the shell's
      // padding under the route. Kept identical in chat- and new-chat-screen.
      className="flex min-h-[calc(100dvh-var(--route-chrome-height)-var(--content-gutter))] flex-col pb-0"
      actions={<ChatHeaderActions detail={detail} />}
    >
      <Stack gap="workspace" className="min-w-0 flex-1 content-start">
        <Conversation
          detail={detail}
          output={
            detail.output ? (
              <OutputPane
                workspaceId={workspaceId}
                chatId={chatId}
                output={detail.output}
                runActive={runActive}
                canEdit={canEdit}
                canSend={access.canSend && !turn.pending}
                onRevise={(message) => turn.send(message)}
              />
            ) : null
          }
          onRefine={turn.suggest}
          onRecover={turn.recover}
          hasDraft={Boolean(turn.draft.trim() || turn.commands.mentions.length)}
          sending={turn.pending}
          onStop={() => detail.latest_run && cancel.mutate({ chatId, runId: detail.latest_run.id })}
          stopping={cancel.isPending}
          canSend={access.canSend && !turn.pending}
        />
        {access.canSend ? null : <Alert tone="info">{access.message}</Alert>}
        <FollowUpFailure turn={turn} actionId={detail.chat.action_id} canSend={access.canSend} />
      </Stack>
      {/* The composer stays at the bottom of the window while the thread scrolls. */}
      <div className="bg-panel z-sticky sticky bottom-0 pt-2 pb-4">
        {showJump ? (
          <Button variant="secondary" size="sm" onClick={jumpToLatest}>
            Jump to latest
          </Button>
        ) : null}
        <Composer
          rows={2}
          id="chat-message"
          label="Reply to the agent"
          value={turn.draft}
          onChange={turn.setDraft}
          onSubmit={() => turn.send(turn.draft)}
          pending={turn.pending}
          disabled={!access.canSend}
          submissionDisabled={runActive}
          placeholder={
            hasOutput
              ? 'Ask about the work or request a change. / picks a skill, @ mentions an Action.'
              : 'Ask a follow-up. / picks a skill, @ mentions an Action.'
          }
          commands={turn.commands}
          tools={
            <SkillPicker
              {...turn.commands.skillPicker}
              value={turn.skillId}
              onChange={turn.setSkillId}
              outputKind={detail.output?.kind}
              inheritedSkillId={
                detail.pinned_skill_id ?? (!detail.chat.action_id ? detail.output?.skill_id : null)
              }
              hasAction={Boolean(detail.chat.action_id)}
              disabled={!access.canSend || runActive}
            />
          }
        />
      </div>
      <div ref={endRef} />
    </PageShell>
  );
}

export function FollowUpFailure({
  turn,
  actionId,
  canSend,
}: Readonly<{ turn: FollowUp; actionId: string | null; canSend: boolean }>) {
  if (!turn.failure) return null;
  return (
    <Alert tone="danger">
      {turn.failure.message}{' '}
      {turn.failure.startNewChat ? (
        <ProjectLink
          href={agentHandoffHref({ actionId, prompt: turn.lastMessage })}
          className="underline"
        >
          Start a new chat
        </ProjectLink>
      ) : null}
      {!turn.failure.startNewChat ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={turn.retrySubmission}
          disabled={turn.pending || !canSend}
        >
          Retry send
        </Button>
      ) : null}
    </Alert>
  );
}

function ChatHeaderActions({ detail }: Readonly<{ detail: AgentChatDetail }>) {
  if (!detail.chat.action_id) return null;
  return (
    <Button asChild variant="ghost" size="sm">
      <ProjectLink href={`/agent/actions/${detail.chat.action_id}`}>Open Action</ProjectLink>
    </Button>
  );
}
