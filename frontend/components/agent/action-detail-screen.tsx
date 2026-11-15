import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { MoreHorizontal, RotateCcw, XCircle, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import {
  ContextualLinkDeclarationRoute,
  isDeclarable,
  SELECT_IMPLEMENTED_LINKS,
  useMarkImplemented,
} from '@/components/agent/action-declaration';
import { AffectedPages } from '@/components/agent/action-affected-pages';
import { ContentGapWhy, contentGapMembers } from '@/components/agent/content-gap-evidence';
import { DeclarationStatus } from '@/components/agent/declaration-status';
import { ActionEvidence, DeveloperTicketButton } from '@/components/agent/developer-ticket';
import { useAgentCatalog } from '@/components/agent/use-agent-catalog';
import { ActionPriorityBadge, ActionStatusBadge } from '@/components/agent/action-status-badge';
import { ActionSection } from '@/components/agent/action-section';
import { RecordPage } from '@/components/templates/record-page';
import type { PageBack } from '@/components/templates/page-frame';
import { EvidenceDrawer } from '@/components/opportunities/evidence-drawer';
import { ACTIONS, ActionButton } from '@/components/ui/actions';
import { Button, buttonClasses } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { DraftSheet } from '@/components/ui/draft-sheet';
import { FactList, type Fact } from '@/components/ui/facts';
import { Icon } from '@/components/ui/icon';
import { Inline, Stack } from '@/components/ui/layout';
import { Menu, MenuContent, MenuItem, MenuLinkItem, MenuTrigger } from '@/components/ui/menu';
import { ProjectLink } from '@/components/ui/project-link';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { LedgerItem, LedgerList } from '@/components/ui/ledger-list';
import { actionTitle } from '@/lib/agent/action-title';
import { actionHandoffHref } from '@/lib/agent/handoff';
import { familyLabel, measurementLegLabel, targetKindLabel } from '@/lib/agent/vocabulary';
import { actionsMutations, actionsQueries, type ActionDetail } from '@/lib/api/actions';
import { agentQueries } from '@/lib/api/agent';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { readableUrl } from '@/lib/format';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import { Section, SectionTitle } from '@/components/ui/section';

const BACK: PageBack = { href: '/agent/actions', label: 'Back to Actions' };

/**
 * One Action (AS7) on the Record template: titled by its work and target
 * (`actionTitle`), its full target and facts in the identity card, the
 * sections read top to bottom (overview with Prepare developer ticket, dated
 * evidence, why, what to do, how it is measured) beside its findings and
 * chats, and its decisions in the sticky action bar.
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
        <StateBlock kind="loading" />
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
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
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
      aside={
        <>
          <Findings action={action} onOpenEvidence={setEvidenceId} />
          <LinkedChats action={action} workspaceId={workspaceId} />
        </>
      }
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
      <AffectedPages action={action} />
      <ActionEvidence action={action} />
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
      <EvidenceDrawer
        opportunityId={evidenceId}
        projectId={action.project_id}
        open={evidenceId !== null}
        onOpenChange={(open) => {
          if (!open) setEvidenceId(null);
        }}
      />
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
 * The work in one message, with the ways to take it elsewhere. An Action the
 * Agent proposed carries the Agent's own words, which no person has accepted,
 * so it is a draft; one found by evidence is filled from that evidence.
 */
function Overview({ action }: Readonly<{ action: ActionDetail }>) {
  const message = <p className={textRole('body')}>{action.handoff.message}</p>;
  const tools = (
    <>
      <DeveloperTicketButton action={action} />
      <CopyButton value={actionPrompt(action)}>Copy as prompt</CopyButton>
    </>
  );
  if (action.origin === 'agent')
    return (
      <DraftSheet title="Overview" state="draft" actions={tools}>
        {message}
      </DraftSheet>
    );
  return (
    <ActionSection title="Overview" id="action-overview" actions={tools}>
      {message}
    </ActionSection>
  );
}

/** The identity card: each fact of the Action once, its full target among them. */
function Identity({ action }: Readonly<{ action: ActionDetail }>) {
  const sources = action.families.map(familyLabel).filter(isText);
  const kind = targetKindLabel(action.target_kind);
  const facts: Fact[] = [
    { label: 'Status', value: <ActionStatusBadge status={action.status} /> },
    { label: 'Priority', value: <ActionPriorityBadge band={action.priority_band} /> },
    {
      label: 'Target',
      value: (
        // The record's own field: the whole address, wrapping.
        <Stack gap="tight" className="min-w-0">
          {action.target_url ? (
            <TextLink
              variant="external"
              href={action.target_url}
              text="body"
              className="justify-self-start break-words"
            >
              {readableUrl(action.target_label)}
            </TextLink>
          ) : (
            <span className={textRole('body', 'break-words')}>
              {readableUrl(action.target_label)}
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

function WhatToDo({ action }: Readonly<{ action: ActionDetail }>) {
  const todo = steps(action);
  if (todo.length === 0) return null;
  return (
    <ActionSection title="What to do" id="action-todo">
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

/** The live findings the Action groups, each with its evidence; or why there are none. */
function Findings({
  action,
  onOpenEvidence,
}: Readonly<{ action: ActionDetail; onOpenEvidence: (id: string) => void }>) {
  return (
    <ActionSection title="Findings" id="action-findings">
      {action.members.length === 0 ? (
        <StateBlock
          kind="empty"
          inline
          message={
            action.evidence_cleared_at
              ? 'No current evidence targets this Action. Its chats are kept.'
              : 'No current finding targets this Action.'
          }
        />
      ) : (
        <LedgerList>
          {action.members.map((member) => (
            <LedgerItem
              key={member.id}
              title={member.title}
              links={
                <ActionButton
                  action="viewEvidence"
                  aria-label={`View evidence for ${member.title}`}
                  onClick={() => onOpenEvidence(member.id)}
                />
              }
            />
          ))}
        </LedgerList>
      )}
    </ActionSection>
  );
}

const isText = (value: string | null): value is string => Boolean(value);

const STATUS_CHANGED = {
  dismissed: 'Action dismissed. Reopen puts it back in the queue.',
  open: 'Action reopened.',
} as const;

/** Shown from the rail breakpoint up; below it the control lives in More. */
const WIDE_ONLY = 'hidden rail:inline-flex';

/**
 * The page's decisions in the record's sticky action bar, on one row at
 * every width: Dismiss (quiet; Reopen once dismissed), Mark implemented
 * (secondary) while the Action can be declared, and Work with the agent, the
 * page's one primary, last. Below the rail breakpoint Dismiss and Mark
 * implemented fold into More. A declared Action keeps only the Agent. An
 * Agent output is declared from its chat, which names the exact revision
 * shipped; here Mark implemented declares work done outside CiteLadder.
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
  changed: 'open' | 'dismissed' | null;
  onStatus: (status: 'open' | 'dismissed') => void;
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
  const dismissed = action.status === 'dismissed';
  const status = {
    label: dismissed ? 'Reopen' : 'Dismiss',
    icon: dismissed ? RotateCcw : XCircle,
    run: () => {
      if (!dismissing) onStatus(dismissed ? 'open' : 'dismissed');
    },
  };
  let declare: Declare = null;
  if (declarable) declare = linkRoute ? 'links' : 'dialog';
  return (
    <Inline as="fieldset" aria-label="Work on this Action" className="flex-1">
      {/* Announced, not drawn: the status mark and this button's label show the change. */}
      <output className="sr-only">{changed ? STATUS_CHANGED[changed] : null}</output>
      <span className="me-auto" />
      {undeclared ? (
        // Never `disabled` while pending: that drops focus to the page, and
        // the same button (now Reopen or Dismiss) keeps it once the change lands.
        <Button
          variant="quiet"
          className={WIDE_ONLY}
          aria-disabled={dismissing || undefined}
          onClick={status.run}
        >
          <Icon icon={status.icon} />
          {status.label}
        </Button>
      ) : null}
      <WideDeclare declare={declare} onStart={markImplemented.start} />
      {undeclared ? (
        <BarMore declare={declare} onStart={markImplemented.start} status={status} />
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

type BarStatus = Readonly<{ label: string; icon: LucideIcon; run: () => void }>;

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

/** Below the rail breakpoint: Mark implemented and Dismiss (or Reopen), folded into More. */
function BarMore({
  declare,
  onStart,
  status,
}: Readonly<{ declare: Declare; onStart: () => void; status: BarStatus }>) {
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
        <MenuItem icon={<Icon icon={status.icon} />} onSelect={status.run}>
          {status.label}
        </MenuItem>
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
