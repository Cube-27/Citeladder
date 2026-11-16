import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { Check, MoreHorizontal, RotateCcw, XCircle, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import {
  ContextualLinkDeclarationRoute,
  isDeclarable,
  SELECT_IMPLEMENTED_LINKS,
  useMarkImplemented,
} from '@/components/agent/action-declaration';
import { ContentGapWhy, contentGapMembers } from '@/components/agent/content-gap-evidence';
import { ActionFindings } from '@/components/agent/action-findings';
import { DeclarationStatus } from '@/components/agent/declaration-status';
import { DeveloperTicketButton } from '@/components/agent/developer-ticket';
import { useAgentCatalog } from '@/components/agent/use-agent-catalog';
import { ActionPriorityBadge, ActionStatusBadge } from '@/components/agent/action-status-badge';
import { ActionSection } from '@/components/agent/action-section';
import { RecordPage } from '@/components/templates/record-page';
import type { PageBack } from '@/components/templates/page-frame';
import { ACTIONS } from '@/components/ui/actions';
import { Button, buttonClasses } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { FactList, type Fact } from '@/components/ui/facts';
import { Icon } from '@/components/ui/icon';
import { Inline, Stack } from '@/components/ui/layout';
import { Menu, MenuContent, MenuItem, MenuLinkItem, MenuTrigger } from '@/components/ui/menu';
import { ProjectLink } from '@/components/ui/project-link';
import { UrlText } from '@/components/ui/table';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { LedgerItem, LedgerList } from '@/components/ui/ledger-list';
import { actionTitle, withShortTarget } from '@/lib/agent/action-title';
import { actionHandoffHref } from '@/lib/agent/handoff';
import { familyLabel, measurementLegLabel, targetKindLabel } from '@/lib/agent/vocabulary';
import {
  actionsMutations,
  actionsQueries,
  type ActionDetail,
  type ActionStatus,
} from '@/lib/api/actions';
import type { ActionUserStatus } from '@citeladder/contracts/actions';
import { agentQueries } from '@/lib/api/agent';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { readableUrl } from '@/lib/format';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import { Section, SectionTitle } from '@/components/ui/section';

const BACK: PageBack = { href: '/actions', label: 'Back to Actions' };

/**
 * One Action (AS7) on the Record template: titled by its work and target
 * (`actionTitle`), its full target once in the identity card, the sections
 * read top to bottom (overview with Prepare developer ticket, its findings
 * with their evidence, why, what to do, how it is measured) beside its chats,
 * and its decisions in the sticky action bar.
 */
export function ActionDetailScreen() {
  const { actionId = '' } = useParams();
  const { workspaceId, projectId } = useProjectScope();
  const query = useQuery({
    ...actionsQueries.detail(workspaceId, actionId),
    enabled: Boolean(actionId),
  });

  if (query.isError)
    return (
      <RecordPage back={BACK}>
        <StateBlock
          kind="error"
          {...readErrorProps(query)}
          title="Couldn't load this Action"
          fallback="This Action could not be loaded."
        />
      </RecordPage>
    );
  if (!query.data)
    return (
      <RecordPage back={BACK}>
        <StateBlock kind="loading" shape={{ kind: 'facts', rows: 4, tagRows: [0, 1] }} />
      </RecordPage>
    );
  if (query.data.project_id !== projectId)
    return (
      <RecordPage back={BACK}>
        <Notice tone="negative">
          This Action belongs to another project. Choose an Action from the current project.
        </Notice>
      </RecordPage>
    );
  // Keyed so a mutation's state (and its Retry) never outlives its Action.
  return <ActionDetailView key={query.data.id} action={query.data} workspaceId={workspaceId} />;
}

function ActionDetailView({
  action,
  workspaceId,
}: Readonly<{ action: ActionDetail; workspaceId: string }>) {
  // Set once this page declares the Action, so its new status takes focus.
  const [declared, setDeclared] = useState(false);
  // Owned here, not by the bar, so a failure notice renders in the column.
  const update = useMutation(actionsMutations.updateStatus(workspaceId));
  const gaps = contentGapMembers(action);
  return (
    <RecordPage
      title={actionTitle({ ...action, approach: action.diagnosis.approach ?? action.approach })}
      back={{ ...BACK, projectId: action.project_id }}
      identity={<Identity action={action} />}
      aside={<LinkedChats action={action} workspaceId={workspaceId} />}
      actionBar={
        <ActionBar
          action={action}
          workspaceId={workspaceId}
          dismissing={update.isPending}
          changed={update.isSuccess ? update.variables.status : null}
          onStatus={(status) => update.mutate({ actionId: action.id, status })}
          onDeclared={() => setDeclared(true)}
        />
      }
    >
      {update.isError ? (
        <Notice
          kind="mutation"
          notice={mutationNoticeForError(update.error, { action: 'update this Action' })}
          onRetry={() => update.variables && update.mutate(update.variables)}
        />
      ) : null}
      <Overview action={action} />
      <ActionFindings action={action} />
      {action.declaration ? (
        <ActionSection title="Implementation" id="action-implementation">
          <DeclarationStatus
            declaration={action.declaration}
            workspaceId={workspaceId}
            focusOnMount={declared}
          />
        </ActionSection>
      ) : null}
      {gaps.length > 0 ? <ContentGapWhy members={gaps} /> : null}
      <WhatToDo action={action} />
      <TextList
        title="Measure with"
        id="action-measure"
        items={(action.diagnosis.measure_with ?? []).map(measurementLegLabel).filter(isText)}
      />
      <TextList title="Avoid" id="action-avoid" items={action.diagnosis.donts ?? []} />
    </RecordPage>
  );
}

/** Each distinct instruction of the Action's findings, in priority order. */
function steps(action: ActionDetail): string[] {
  return [...new Set(action.members.map((member) => member.remediation).filter(isText))];
}

/**
 * What Copy as prompt puts on the clipboard: the message the Agent chat opens
 * with, then the Action's steps, for a reader working in another assistant.
 */
function actionPrompt(action: ActionDetail): string {
  const todo = steps(action);
  if (todo.length === 0) return action.handoff.message;
  const lines = todo.map((step, index) => `${index + 1}. ${step}`);
  return [action.handoff.message, '', 'What to do:', ...lines].join('\n');
}

/**
 * The work in one message, its target named short (the Target row holds the
 * whole address), with the ways to take it elsewhere. An Action the Agent
 * proposed carries the Agent's own words, captioned as its suggestion.
 */
function Overview({ action }: Readonly<{ action: ActionDetail }>) {
  return (
    <ActionSection
      title="Overview"
      id="action-overview"
      caption={agentCaption(action)}
      actions={
        <>
          <DeveloperTicketButton action={action} />
          <CopyButton value={actionPrompt(action)}>Copy as prompt</CopyButton>
        </>
      }
    >
      <p className={textRole('body')}>{withShortTarget(action.handoff.message, action)}</p>
    </ActionSection>
  );
}

/** The identity card: each fact of the Action once, its full target among them. */
function Identity({ action }: Readonly<{ action: ActionDetail }>) {
  const sources = action.families.map(familyLabel).filter(isText);
  const kind = targetKindLabel(action.target_kind);
  const facts: Fact[] = [
    {
      label: 'Status',
      value: <ActionStatusBadge status={action.status} measurement={action.measurement} />,
    },
    { label: 'Priority', value: <ActionPriorityBadge band={action.priority_band} /> },
    {
      label: 'Target',
      value: (
        <Stack gap="tight" className="min-w-0">
          {action.target_url ? (
            <TextLink
              variant="external"
              href={action.target_url}
              text="body"
              className="flex max-w-full min-w-0 items-center justify-self-start"
            >
              <TargetText label={action.target_label} />
            </TextLink>
          ) : (
            <span className={textRole('body', 'flex min-w-0')}>
              <TargetText label={action.target_label} />
            </span>
          )}
          {kind ? <span className={textRole('caption')}>{kind}</span> : null}
        </Stack>
      ),
    },
  ];
  if (sources.length) facts.push({ label: 'Source', value: sources.join(', ') });
  return (
    <Section aria-labelledby="action-details">
      <SectionTitle id="action-details" level={2} className="sr-only">
        Details
      </SectionTitle>
      <FactList layout="ruled" facts={facts} />
    </Section>
  );
}

/** An address on one line, cut in the middle with the whole in its tooltip; any other label as written. */
function TargetText({ label }: Readonly<{ label: string }>) {
  if (/^https?:\/\//iu.test(label)) return <UrlText url={label} />;
  return <span className="min-w-0 break-words">{readableUrl(label)}</span>;
}

/** The caption under a card whose words the agent wrote: suggested, never accepted or rejected. */
const agentCaption = (action: ActionDetail) =>
  action.origin === 'agent' ? 'Suggested by the agent' : null;

function WhatToDo({ action }: Readonly<{ action: ActionDetail }>) {
  const todo = steps(action);
  if (todo.length === 0) return null;
  return (
    <ActionSection title="What to do" id="action-todo" caption={agentCaption(action)}>
      <Stack as="ol" gap="tight" className="list-inside list-decimal">
        {todo.map((step) => (
          <li key={step} className={textRole('body')}>
            {step}
          </li>
        ))}
      </Stack>
    </ActionSection>
  );
}

function TextList({
  title,
  id,
  items,
}: Readonly<{ title: string; id: string; items: readonly string[] }>) {
  if (items.length === 0) return null;
  return (
    <ActionSection title={title} id={id}>
      <Stack as="ul" gap="tight" className="list-inside list-disc">
        {items.map((item) => (
          <li key={item} className={textRole('body')}>
            {item}
          </li>
        ))}
      </Stack>
    </ActionSection>
  );
}

const isText = (value: string | null): value is string => Boolean(value);

const STATUS_CHANGED: Record<ActionUserStatus, string> = {
  in_progress: 'Action accepted. It is in progress.',
  dismissed: 'Action declined. Restore puts it back in New.',
  open: 'Action restored to New.',
};

const ACCEPT = { label: 'Accept', icon: Check, to: 'in_progress' } as const;
const DECLINE = { label: 'Decline', icon: XCircle, to: 'dismissed' } as const;
const RESTORE = { label: 'Restore', icon: RotateCcw, to: 'open' } as const;

/** The status decisions each status offers (owner 2026-11-16); Done offers none. */
const DECISIONS: Record<ActionStatus, readonly BarDecision[]> = {
  open: [DECLINE, ACCEPT],
  in_progress: [DECLINE],
  dismissed: [RESTORE, ACCEPT],
  done: [],
};

/** Shown from the rail breakpoint up; below it the control lives in More. */
const WIDE_ONLY = 'hidden rail:inline-flex';

/**
 * The page's decisions in the record's sticky action bar, on one row at
 * every width: Decline / Restore (quiet) and Accept as the status allows,
 * Mark implemented (secondary) while the Action can be declared, and Work
 * with the agent, the page's one primary, last. Below the rail breakpoint the
 * decisions and Mark implemented fold into More. A declared Action keeps only
 * the Agent. An Agent output is declared from its chat, which names the exact
 * revision shipped; here Mark implemented declares work done outside CiteLadder.
 */
function ActionBar({
  action,
  workspaceId,
  dismissing,
  changed,
  onStatus,
  onDeclared,
}: Readonly<{
  action: ActionDetail;
  workspaceId: string;
  dismissing: boolean;
  /** The status this page last set, so its result is announced. */
  changed: ActionUserStatus | null;
  onStatus: (status: ActionUserStatus) => void;
  onDeclared: () => void;
}>) {
  const mayWrite = useWorkspaceCapability('write');
  const undeclared = mayWrite && !action.declaration;
  const declarable = undeclared && isDeclarable(action);
  const linkRoute = action.members.some((member) => member.rule_id === 'site_contextual_links');
  const markImplemented = useMarkImplemented({
    workspaceId,
    action,
    revision: null,
    onDeclared,
  });
  const decisions = undeclared ? DECISIONS[action.status] : [];
  const decide = (to: ActionUserStatus) => {
    if (!dismissing) onStatus(to);
  };
  let declare: Declare = null;
  if (declarable) declare = linkRoute ? 'links' : 'dialog';
  return (
    <Inline as="fieldset" aria-label="Work on this Action" className="flex-1">
      {/* Announced, not drawn: the status mark shows the change. */}
      <output className="sr-only">{changed ? STATUS_CHANGED[changed] : null}</output>
      <span className="me-auto" />
      {decisions.map((decision, slot) => (
        // Keyed by slot, so Decline and Restore are one button that keeps focus
        // across the change; never `disabled` while pending, which drops it.
        <Button
          key={slot}
          variant={decision.to === 'in_progress' ? 'secondary' : 'quiet'}
          className={WIDE_ONLY}
          aria-disabled={dismissing || undefined}
          onClick={() => decide(decision.to)}
        >
          <Icon icon={decision.icon} />
          {decision.label}
        </Button>
      ))}
      <WideDeclare declare={declare} onStart={markImplemented.start} />
      {undeclared ? (
        <BarMore
          declare={declare}
          onStart={markImplemented.start}
          decisions={decisions}
          onDecide={decide}
        />
      ) : null}
      {/* The named action, in its primary place: this bar is where it is decided. */}
      <ProjectLink href={actionHandoffHref(action)} className={buttonClasses('primary')}>
        <Icon icon={ACTIONS.workWithAgent.icon} />
        {ACTIONS.workWithAgent.label}
      </ProjectLink>
      {markImplemented.dialog}
    </Inline>
  );
}

/** How Mark implemented declares here: by picking links, by its dialog, or not at all. */
type Declare = 'links' | 'dialog' | null;

type BarDecision = Readonly<{ label: string; icon: LucideIcon; to: ActionUserStatus }>;

/** Mark implemented in the bar, from the rail breakpoint up. */
function WideDeclare({ declare, onStart }: Readonly<{ declare: Declare; onStart: () => void }>) {
  if (declare === 'links') return <ContextualLinkDeclarationRoute className={WIDE_ONLY} />;
  if (declare === null) return null;
  return (
    <Button variant="secondary" className={WIDE_ONLY} onClick={onStart}>
      <Icon icon={ACTIONS.markImplemented.icon} />
      {ACTIONS.markImplemented.label}
    </Button>
  );
}

/** Below the rail breakpoint: Mark implemented and the status decisions, folded into More. */
function BarMore({
  declare,
  onStart,
  decisions,
  onDecide,
}: Readonly<{
  declare: Declare;
  onStart: () => void;
  decisions: readonly BarDecision[];
  onDecide: (to: ActionUserStatus) => void;
}>) {
  return (
    <Menu modal={false}>
      <MenuTrigger asChild>
        <Button variant="quiet" className="rail:hidden">
          <Icon icon={MoreHorizontal} />
          More
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        {declare === 'links' ? (
          <MenuLinkItem>
            <ProjectLink href={SELECT_IMPLEMENTED_LINKS.href}>
              <Icon icon={SELECT_IMPLEMENTED_LINKS.icon} />
              {SELECT_IMPLEMENTED_LINKS.label}
            </ProjectLink>
          </MenuLinkItem>
        ) : null}
        {declare === 'dialog' ? (
          <MenuItem icon={<Icon icon={ACTIONS.markImplemented.icon} />} onSelect={onStart}>
            {ACTIONS.markImplemented.label}
          </MenuItem>
        ) : null}
        {decisions.map((decision) => (
          <MenuItem
            key={decision.to}
            icon={<Icon icon={decision.icon} />}
            onSelect={() => onDecide(decision.to)}
          >
            {decision.label}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

function LinkedChats({
  action,
  workspaceId,
}: Readonly<{ action: ActionDetail; workspaceId: string }>) {
  const { kindLabel } = useAgentCatalog();
  const chats = useInfiniteQuery(
    agentQueries.chats({ workspaceId, projectId: action.project_id }, { actionId: action.id }),
  );
  const rows = chats.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <ActionSection title="Chats" id="action-chats">
      {chats.isError ? (
        <Notice
          kind="read"
          {...readErrorProps(chats)}
          title="Couldn't load the linked chats"
          fallback="Linked chats could not be loaded."
        />
      ) : null}
      {chats.isSuccess && rows.length === 0 ? (
        <StateBlock kind="empty" inline message="No chats have worked on this Action yet." />
      ) : null}
      {rows.length > 0 ? (
        <LedgerList>
          {rows.map((chat) => (
            <LedgerItem
              key={chat.id}
              title={
                <TextLink href={`/agent/chats/${chat.id}`} text="body">
                  {chat.title}
                </TextLink>
              }
              caption={chat.output_kind ? kindLabel(chat.output_kind) : undefined}
            />
          ))}
        </LedgerList>
      ) : null}
      {chats.hasNextPage ? (
        <Button
          variant="secondary"
          className="justify-self-start"
          disabled={chats.isFetchingNextPage}
          onClick={() => void chats.fetchNextPage()}
        >
          Show more chats
        </Button>
      ) : null}
    </ActionSection>
  );
}
