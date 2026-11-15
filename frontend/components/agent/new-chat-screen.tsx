import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { AgentFailureNotice } from '@/components/agent/agent-failure-notice';
import { BriefingCard } from '@/components/agent/briefing-card';
import { Composer } from '@/components/agent/composer';
import { useSkillChoice } from '@/components/agent/skill-picker';
import { useAgentCatalog } from '@/components/agent/use-agent-catalog';
import { useCreateChat } from '@/components/agent/use-chat-turns';
import { useComposerCommands } from '@/components/agent/use-composer-commands';
import { ChatHistory } from '@/components/agent/chat-history';
import { ThreadPage } from '@/components/templates/thread-page';
import { Stack } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';
import { useAgentAccess } from '@/lib/agent/use-agent-access';
import { contextChips, parseAgentHandoff, withoutContext } from '@/lib/agent/handoff';
import { approachLabel, targetKindLabel } from '@/lib/agent/vocabulary';
import { actionsQueries, type Action } from '@/lib/api/actions';
import { shortUrlTitle } from '@/lib/format';
import { useProjectHref } from '@/lib/navigation/project-destination';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { Notice, readErrorProps } from '@/components/ui/notice';

/**
 * New chat: the greeting and composer at the top of the thread column with
 * "What should I work on?" beneath it. Skills and the project's top Actions are in the
 * composer's + menu. An evidence-screen handoff arrives as typed references
 * in the URL and is shown as removable context before the first message is
 * sent. A chat opened on an Action is about that Action alone: it is one
 * removable line in the composer above its written message, and the
 * briefing waits until it is removed.
 */
export function NewChatScreen() {
  const { workspaceId, projectId } = useProjectScope();
  const [searchParams] = useSearchParams();
  const handoffKey = searchParams.toString();
  return (
    <NewChat
      key={`${projectId}:${handoffKey}`}
      workspaceId={workspaceId}
      projectId={projectId}
      searchParams={searchParams}
    />
  );
}

function NewChat({
  workspaceId,
  projectId,
  searchParams,
}: Readonly<{ workspaceId: string; projectId: string; searchParams: URLSearchParams }>) {
  const handoff = useMemo(() => parseAgentHandoff(searchParams), [searchParams]);
  // Undefined until typed: the composer shows the URL's prompt or, for an
  // Action handoff, the Action's own message once it loads. The message is
  // read, never carried in the URL, so history and logs keep only ids.
  const [typed, setTyped] = useState(handoff.prompt);
  const [context, setContext] = useState(handoff.context);
  const [skillId, setSkillId] = useState<string | null | undefined>(handoff.skillId ?? undefined);
  // A next step or an Action's page work arrives with its workflow pinned.
  const [pinnedId, setPinnedId] = useState(handoff.workflowId);
  const catalog = useAgentCatalog();
  const pinned = catalog.workflow(pinnedId);
  const access = useAgentAccess();
  const navigate = useNavigate();
  const projectHref = useProjectHref();
  const create = useCreateChat(workspaceId, projectId, (chatId) =>
    navigate(projectHref(`/agent/chats/${chatId}`)),
  );
  const failure = create.failure;
  const commands = useComposerCommands({ workspaceId, projectId });
  const { actionId, message, attachment, unavailable } = useAttachedAction(
    workspaceId,
    handoff.actionId,
    typed,
    setTyped,
  );
  const skill = useSkillChoice({
    value: pinnedId ? undefined : skillId,
    // A skill or Automatic picked from the menu replaces a pinned workflow.
    onChange: (next) => {
      if (next !== undefined) setPinnedId(undefined);
      setSkillId(next);
    },
    hasAction: Boolean(actionId),
    pinned: pinnedId
      ? { label: pinned?.label ?? '…', onRemove: () => setPinnedId(undefined) }
      : undefined,
  });
  // A workflow is sent by id; the server validates it and pins its skill.
  const start = () =>
    commands.prepare(
      // Until typed into, the draft is the Action's message.
      { message, edit: (change) => setTyped((current) => change(current ?? message)) },
      (prepared) =>
        create.start({
          ...prepared,
          skillId: pinnedId ? undefined : skillId,
          workflowId: pinnedId,
          actionId,
          context,
        }),
    );
  const pending = create.pending || commands.resolving;

  return (
    <ThreadPage history={<ChatHistory />}>
      {/* The greeting, composer and briefing start at the top of the thread
          column, where a chat's first turn will be. */}
      <Stack gap="section">
        <h2 className={textRole('display')}>What can I help with?</h2>
        {unavailable ? (
          <Notice tone="negative">
            This Action is unavailable. The chat will start without it.
          </Notice>
        ) : null}
        {access.canSend ? null : <Notice tone="info">{access.message}</Notice>}
        {failure ? <AgentFailureNotice failure={failure} /> : null}
        {/* Without the catalog there are no skills to offer, and saying
            nothing read as a plan that has none. */}
        {catalog.read.status === 'error' ? (
          <Notice
            kind="read"
            {...readErrorProps(catalog.read)}
            title="Couldn't load skills"
            fallback="The request failed or timed out."
          />
        ) : null}
        <Stack gap="tight">
          <Composer
            id="new-chat-message"
            label="Message the agent"
            value={message}
            onChange={setTyped}
            onSubmit={start}
            pending={pending}
            disabled={!access.canSend}
            placeholder="Ask a question or describe the work"
            attachment={attachment}
            skill={skill}
            chips={contextChips(context)}
            commands={commands}
            onRemoveChip={(chip) => setContext((current) => withoutContext(current, chip.key))}
          />
          {/* Instructions live in a caption, not the placeholder, so they stay
              readable once the user starts typing. A chat about one Action
              starts from its message instead. */}
          {actionId ? null : (
            <p className={textRole('caption')}>Type / to pick a skill or @ to mention an Action.</p>
          )}
        </Stack>
        {/* With an Action attached the screen is about that one Action: the
            briefing returns once it is removed. */}
        {actionId ? null : (
          <BriefingCard
            workspaceId={workspaceId}
            projectId={projectId}
            onStart={create.start}
            pending={pending}
            disabled={!access.canSend}
          />
        )}
      </Stack>
    </ThreadPage>
  );
}

/**
 * The Action the chat is about, until the reader removes it, and the message
 * the composer shows: what was typed, else the Action's own message. An Action
 * that failed to load is dropped, as its notice promises, rather than failing
 * the whole chat.
 */
function useAttachedAction(
  workspaceId: string,
  handoffActionId: string | undefined,
  typed: string | undefined,
  setMessage: (message: string) => void,
) {
  const [attachedId, setAttachedId] = useState(handoffActionId);
  const attached = useQuery({
    ...actionsQueries.detail(workspaceId, handoffActionId ?? ''),
    enabled: Boolean(handoffActionId),
  });
  const actionId = attached.isError ? undefined : attachedId;
  const message = typed ?? (attachedId ? attached.data?.handoff.message : undefined) ?? '';
  const attachment =
    actionId && attached.data
      ? {
          label: attachmentLabel(attached.data),
          // The message stays as written; only the Action leaves.
          onRemove: () => {
            setMessage(message);
            setAttachedId(undefined);
          },
        }
      : undefined;
  return { actionId, message, attachment, unavailable: attached.isError };
}

/**
 * The attached Action as one line in the composer: "Action:", its short
 * title, then its type (the approach, else the kind of target).
 */
function attachmentLabel(action: Action): string {
  const type = approachLabel(action.approach) ?? targetKindLabel(action.target_kind);
  const title = `Action: ${shortUrlTitle(action.target_label)}`;
  return type ? `${title} · ${type}` : title;
}
