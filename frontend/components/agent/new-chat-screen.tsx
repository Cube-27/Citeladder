'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ActionStatusBadge } from '@/components/agent/action-status-badge';
import { BriefingCard } from '@/components/agent/briefing-card';
import { Composer } from '@/components/agent/composer';
import { SkillPicker } from '@/components/agent/skill-picker';
import { useCreateChat } from '@/components/agent/use-chat-turns';
import { useComposerCommands } from '@/components/agent/use-composer-commands';
import { PageShell } from '@/components/layout/page-shell';
import { ProjectLink } from '@/components/layout/scoped-link';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Stack } from '@/components/ui/layout';
import { panelClasses } from '@/components/ui/panel';
import { SectionTitle, textRole } from '@/components/ui/typography';
import { useAgentAccess } from '@/lib/agent/use-agent-access';
import {
  agentHandoffHref,
  contextChips,
  parseAgentHandoff,
  withoutContext,
} from '@/lib/agent/handoff';
import { approachLabel, targetKindLabel } from '@/lib/agent/vocabulary';
import { actionsQueries, type Action } from '@/lib/api/actions';
import { AGENT_TOP_ACTIONS } from '@/lib/config/agent';
import { useProjectHref } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';

/** Questions use ordinary chat; only explicit deliverables select a methodology. */
const STARTERS = [
  { text: 'What should I focus on this week?', skillId: undefined },
  { text: 'Why are we missing from AI answers?', skillId: undefined },
  { text: 'Create content for our highest-demand topic.', skillId: 'content_create' },
  {
    text: 'Analyze our most important technical issue and plan the work.',
    skillId: 'technical_health',
  },
] as const;

/**
 * New chat: ask a question, request a deliverable, or pick up an Action.
 * An evidence-screen handoff arrives as typed references in the URL and is
 * shown as removable context before the first message is sent.
 */
export function NewChatScreen() {
  const { activeProjectId, activeWorkspaceId } = useProjectContext();
  const [searchParams] = useSearchParams();
  const handoffKey = searchParams.toString();
  return activeProjectId && activeWorkspaceId ? (
    <NewChat
      key={`${activeProjectId}:${handoffKey}`}
      workspaceId={activeWorkspaceId}
      projectId={activeProjectId}
      searchParams={searchParams}
    />
  ) : (
    <PageShell measure="workflow">
      <Alert tone="info">Select or create a project to start a chat.</Alert>
    </PageShell>
  );
}

function NewChat({
  workspaceId,
  projectId,
  searchParams,
}: Readonly<{ workspaceId: string; projectId: string; searchParams: URLSearchParams }>) {
  const handoff = useMemo(() => parseAgentHandoff(searchParams), [searchParams]);
  const [message, setMessage] = useState(handoff.prompt ?? '');
  const [context, setContext] = useState(handoff.context);
  const [skillId, setSkillId] = useState<string | null | undefined>(handoff.skillId ?? undefined);
  const access = useAgentAccess();
  const navigate = useNavigate();
  const projectHref = useProjectHref();
  const create = useCreateChat(workspaceId, projectId, (chatId) =>
    navigate(projectHref(`/agent/chats/${chatId}`)),
  );
  const failure = create.failure;
  const commands = useComposerCommands({ workspaceId, projectId });
  // Shares AttachedAction's cache entry. An Action that failed to load is
  // dropped, as that notice promises, rather than failing the whole chat.
  const attached = useQuery({
    ...actionsQueries.detail(workspaceId, handoff.actionId ?? ''),
    enabled: Boolean(handoff.actionId),
  });

  const submit = () => {
    create.start({
      message,
      skillId,
      actionId: attached.isError ? undefined : handoff.actionId,
      context,
      mentions: commands.mentions.map((mention) => mention.id),
    });
  };

  return (
    <PageShell
      measure="workflow"
      className="flex min-h-[calc(100dvh-var(--page-band-identity))] flex-col"
    >
      <Stack gap="section" className="my-auto">
        <h2 className={textRole('sectionTitle', 'text-center')}>What can I help with?</h2>
        {handoff.actionId ? (
          <AttachedAction workspaceId={workspaceId} actionId={handoff.actionId} />
        ) : null}
        {access.canSend ? null : <Alert tone="info">{access.message}</Alert>}
        {failure ? <Alert tone="danger">{failure.message}</Alert> : null}
        <Composer
          id="new-chat-message"
          label="Message the agent"
          value={message}
          onChange={setMessage}
          onSubmit={submit}
          pending={create.pending}
          disabled={!access.canSend}
          placeholder="Ask a question or describe the work you need. / picks a skill, @ mentions an Action."
          chips={contextChips(context)}
          commands={commands}
          onRemoveChip={(chip) => setContext((current) => withoutContext(current, chip.key))}
          tools={
            <SkillPicker
              {...commands.skillPicker}
              value={skillId}
              onChange={setSkillId}
              hasAction={Boolean(handoff.actionId && !attached.isError)}
              disabled={!access.canSend}
            />
          }
        />
        <fieldset
          className="flex min-w-0 flex-wrap justify-center gap-2"
          aria-label="Starter prompts"
        >
          {STARTERS.map((starter) => (
            <Button
              key={starter.text}
              variant="secondary"
              size="sm"
              className="h-auto max-w-full py-2 whitespace-normal"
              disabled={!access.canSend || create.pending}
              onClick={() => {
                setMessage(starter.text);
                setSkillId(starter.skillId);
              }}
            >
              {starter.text}
            </Button>
          ))}
        </fieldset>
        {handoff.actionId ? null : (
          <Disclosure title="Work on an Action">
            <Stack gap="section">
              <BriefingCard
                workspaceId={workspaceId}
                projectId={projectId}
                onStart={create.start}
                pending={create.pending}
                disabled={!access.canSend}
              />
              <TopActions workspaceId={workspaceId} projectId={projectId} />
            </Stack>
          </Disclosure>
        )}
      </Stack>
    </PageShell>
  );
}

function AttachedAction({
  workspaceId,
  actionId,
}: Readonly<{ workspaceId: string; actionId: string }>) {
  const query = useQuery(actionsQueries.detail(workspaceId, actionId));
  if (query.isError)
    return <Alert tone="danger">This Action is unavailable. The chat will start without it.</Alert>;
  if (!query.data) return null;
  const action = query.data;
  return (
    <section aria-label="Working on" className={panelClasses({ pad: 'compact' }, 'grid gap-1')}>
      <span className={textRole('label')}>Working on</span>
      <div className="flex flex-wrap items-center gap-2">
        <ProjectLink
          href={`/agent/actions/${action.id}`}
          className={textRole('itemTitle', 'hover:text-accent-text')}
        >
          {action.target_label}
        </ProjectLink>
        <ActionStatusBadge status={action.status} />
      </div>
      <span className={textRole('caption')}>
        {[targetKindLabel(action.target_kind), approachLabel(action.approach)]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </section>
  );
}

function TopActions({
  workspaceId,
  projectId,
}: Readonly<{ workspaceId: string; projectId: string }>) {
  const query = useQuery(actionsQueries.list(workspaceId, projectId));
  const top = query.data?.items.slice(0, AGENT_TOP_ACTIONS) ?? [];
  if (top.length === 0) return null;
  return (
    <section aria-labelledby="top-actions" className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle id="top-actions">Recommended Actions</SectionTitle>
        <Button asChild variant="ghost" size="sm">
          <ProjectLink href="/agent/actions">All Actions</ProjectLink>
        </Button>
      </div>
      <ul className="grid gap-2">
        {top.map((action) => (
          <TopActionRow key={action.id} action={action} />
        ))}
      </ul>
    </section>
  );
}

function TopActionRow({ action }: Readonly<{ action: Action }>) {
  return (
    <li className={panelClasses({ pad: 'compact' }, 'flex flex-wrap items-center gap-3')}>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <ProjectLink
          href={`/agent/actions/${action.id}`}
          className={textRole('itemTitle', 'hover:text-accent-text truncate')}
        >
          {action.target_label}
        </ProjectLink>
        <span className={textRole('caption')}>
          {[approachLabel(action.approach), `${action.families.length} evidence systems`]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <Button asChild variant="secondary" size="sm">
        <ProjectLink href={agentHandoffHref({ actionId: action.id })}>Work on this</ProjectLink>
      </Button>
    </li>
  );
}
