import { useMemo, useRef, useState, type ReactNode } from 'react';

import { isDeclarable, MarkImplementedButton } from '@/components/agent/action-declaration';
import { useChatThread, type ChatThread } from '@/components/agent/chat-thread';
import { contentGapMembers } from '@/components/agent/content-gap-evidence';
import { WorkbenchPage } from '@/components/templates/workbench-page';
import { StatusMark } from '@/components/ui/status-mark';
import { Button } from '@/components/ui/button';
import {
  EDITOR_RAIL_TAB,
  EditorPane,
  EditorRail,
  EditorRailPanel,
  EditorStack,
  EditorWorkspace,
} from '@/components/ui/editor-workspace';
import { Icon } from '@/components/ui/icon';
import { Inline } from '@/components/ui/layout';
import { TabPanel, TabRow, TabsRoot } from '@/components/ui/tabs';
import { textRole } from '@/components/ui/text-role';
import { UnsavedChangesGuard } from '@/components/ui/unsaved-changes-guard';
import {
  suggestionHighlights,
  withQuotedReference,
  type SuggestionHighlight,
} from '@/lib/agent/page-workspace';
import { Sparkles, Undo2 } from '@/lib/icons';
import { suggestionCategoryLabel } from '@/lib/agent/vocabulary';
import type { ActionDetail } from '@/lib/api/actions';
import type { AgentChatDetail, AgentOutput, AgentRevision, AgentSuggestion } from '@/lib/api/agent';
import { shortUrlTitle } from '@/lib/format';
import { useWorkspaceCapability } from '@/lib/project/project-context';

import type { HighlightAct } from './editor-highlights';
import { ExportMenu } from './export-menu';
import { OutlinePanel } from './outline-panel';
import { PageEditor, type PageEditorHandle } from './page-editor';
import { PageFields } from './page-fields';
import { SeoPanel } from './seo-panel';
import {
  SuggestionsPanel,
  useSuggestionChanges,
  type ContextReference,
  type SuggestionChanges,
} from './suggestions-panel';
import {
  RAIL_TABS,
  useChatAction,
  usePageDraft,
  usePageSuggestions,
  usePageText,
  useWorkspaceTabs,
  type PageDraft,
  type RailTab,
  type WorkspaceTabs,
} from './use-page-workspace';
import { WorkspaceComposer, WorkspaceConversation } from './workspace-chat';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

import './page-workspace.css';

const ASK_REQUEST = 'Suggest how to improve this passage.';

function highlightLabel(suggestion: AgentSuggestion): string {
  const category = suggestionCategoryLabel(suggestion.category);
  if (suggestion.status === 'applied') return `${category} suggestion: applied`;
  return suggestion.readiness === 'needs_input'
    ? `${category} suggestion: needs a fact from you`
    : `${category} suggestion`;
}

function WorkspaceDeclaration({
  workspaceId,
  action,
  revision,
  disabled,
}: Readonly<{
  workspaceId: string;
  action: ActionDetail | null;
  revision: AgentRevision;
  disabled: boolean;
}>) {
  const mayWrite = useWorkspaceCapability('write');
  if (!action) return null;
  if (action.declaration) return <StatusMark tone="positive">Marked implemented</StatusMark>;
  if (!isDeclarable(action) || !mayWrite) return null;
  return (
    <MarkImplementedButton
      workspaceId={workspaceId}
      action={action}
      revision={{ id: revision.id, number: revision.number }}
      disabled={disabled}
    />
  );
}

function lockedReason(canEdit: boolean, runActive: boolean, editing: boolean): string | null {
  if (!canEdit) return 'Your role can read this page but not change it.';
  if (runActive) return 'The agent is working on the page. Changes open again when it finishes.';
  return editing ? 'Save or discard your edits to the page first.' : null;
}

function workspaceHeader(detail: AgentChatDetail, output: AgentOutput) {
  const label = output.target_label ?? detail.chat.target_label ?? output.latest_revision.title;
  const actionId = detail.chat.action_id;
  return {
    title: shortUrlTitle(label),
    trail: [
      { label: 'Actions', href: '/actions' },
      ...(actionId ? [{ label: 'Action', href: `/actions/${actionId}` }] : []),
    ],
  };
}

function SuggestionsTab({
  suggestions,
  ...props
}: Readonly<
  { suggestions: ReturnType<typeof usePageSuggestions> } & Omit<
    Parameters<typeof SuggestionsPanel>[0],
    'page'
  >
>) {
  const { query, page } = suggestions;
  if (page) return <SuggestionsPanel page={page} {...props} />;
  if (!query.isError)
    return <StateBlock kind="loading" label="Loading suggestions…" shape={{ kind: 'list' }} />;
  return (
    <StateBlock
      kind="error"
      {...readErrorProps(query)}
      title="Couldn't load the suggestions"
      fallback="The suggestions could not be loaded."
    />
  );
}

function opensChat(thread: ChatThread, showChat: () => void): ChatThread {
  return {
    ...thread,
    turn: {
      ...thread.turn,
      send: (message) => {
        showChat();
        thread.turn.send(message);
      },
    },
  };
}

export function PageWorkspace({
  detail,
  output,
  workspaceId,
}: Readonly<{ detail: AgentChatDetail; output: AgentOutput; workspaceId: string }>) {
  const chatId = detail.chat.id;
  const revision = output.latest_revision;
  const thread = useChatThread(workspaceId, detail);
  const canEdit = useWorkspaceCapability('run');
  const tabs = useWorkspaceTabs(thread.runActive ? 'chat' : 'suggestions');
  const editor = useRef<PageEditorHandle>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selection, setSelection] = useState('');
  const [focusRequest, setFocusRequest] = useState(0);
  const draft = usePageDraft(workspaceId, output, chatId);
  const suggestions = usePageSuggestions(workspaceId, detail, output);
  const { page } = suggestions;
  const action = useChatAction(workspaceId, detail.chat.action_id);
  const { shown, text, editing, status } = usePageText(detail, revision, draft);
  const changes = useSuggestionChanges(workspaceId, {
    chatId,
    outputId: output.id,
    baseRevisionId: revision.id,
  });
  const locked = lockedReason(canEdit, thread.runActive, editing);
  const actionable = locked === null && !changes.pending;
  const highlights = useMemo<readonly SuggestionHighlight[]>(
    () => (page && shown === revision.body ? suggestionHighlights(page.items, highlightLabel) : []),
    [page, shown, revision.body],
  );

  const addToContext = (reference: ContextReference) => {
    thread.turn.setDraft((current) => withQuotedReference(current, reference));
    setFocusRequest((count) => count + 1);
    if (tabs.narrow) tabs.show('chat');
  };
  const openCard = (id: string) => {
    setSelectedId(id);
    tabs.show('suggestions');
  };
  const act = (id: string, kind: HighlightAct) => {
    const suggestion = page?.items.find((item) => item.id === id);
    if (suggestion && actionable) changes.change(suggestion, kind);
  };
  const chatThread = opensChat(thread, () => tabs.show('chat'));

  const pagePane = (
    <EditorPane
      label="Page"
      head={
        <PageHead
          status={status}
          draft={draft}
          notice={pageNotice(tabs, changes.notice)}
          canAsk={thread.access.canSend && selection.trim().length > 0}
          onAsk={() => addToContext({ quote: selection, request: ASK_REQUEST })}
        />
      }
    >
      <div className="flex min-h-full flex-col">
        {revision.fields ? (
          <PageFields
            fields={revision.fields}
            suggestions={page?.items ?? []}
            actionable={actionable}
            onAct={act}
            onShow={openCard}
          />
        ) : null}
        <PageEditor
          ref={editor}
          label="Page content (Markdown)"
          text={shown}
          editing={editing}
          readOnly={thread.runActive || !canEdit}
          highlights={highlights}
          actionable={actionable}
          onChange={draft.edit}
          onSelection={setSelection}
          onHighlight={openCard}
          onAct={act}
        />
      </div>
    </EditorPane>
  );
  const panels: ToolPanels = {
    suggestions: (
      <SuggestionsTab
        suggestions={suggestions}
        changes={changes}
        body={revision.body}
        locked={locked}
        gaps={action ? contentGapMembers(action) : []}
        selectedId={selectedId}
        onShow={(id) => tabs.inPage(() => editor.current?.revealHighlight(id))}
        onAddToContext={addToContext}
      />
    ),
    outline: (
      <OutlinePanel
        body={text}
        onJump={(from) => tabs.inPage(() => editor.current?.jumpTo(from))}
      />
    ),
    seo: <SeoPanel fetch={detail.page_fetch?.status === 'done' ? detail.page_fetch : null} />,
  };
  const composer = (
    <WorkspaceComposer thread={chatThread} detail={detail} focusRequest={focusRequest} />
  );
  const header = workspaceHeader(detail, output);

  return (
    <WorkbenchPage
      title={header.title}
      trail={header.trail}
      actions={
        <>
          <WorkspaceDeclaration
            workspaceId={workspaceId}
            action={action}
            revision={revision}
            disabled={thread.runActive || editing}
          />
          <ExportMenu
            title={revision.fields?.title || revision.title}
            body={text}
            fields={revision.fields}
          />
        </>
      }
    >
      <UnsavedChangesGuard when={editing} />
      <WorkspaceLayout
        tabs={tabs}
        open={page?.counts.open}
        page={pagePane}
        panels={panels}
        conversation={<WorkspaceConversation thread={chatThread} detail={detail} />}
        composer={composer}
      />
    </WorkbenchPage>
  );
}

type ToolPanels = Record<Exclude<RailTab, 'chat'>, ReactNode>;

function pageNotice(tabs: WorkspaceTabs, notice: SuggestionChanges['notice']) {
  return tabs.railTab === 'suggestions' && !tabs.narrow ? null : notice;
}

function WorkspaceLayout({
  tabs,
  open,
  page,
  panels,
  conversation,
  composer,
}: Readonly<{
  tabs: WorkspaceTabs;
  open: number | undefined;
  page: ReactNode;
  panels: ToolPanels;
  conversation: ReactNode;
  composer: ReactNode;
}>) {
  const railPanels = RAIL_TABS.map((value) => (
    <TabPanel key={value} value={value} className={EDITOR_RAIL_TAB}>
      {value === 'chat' ? conversation : <EditorRailPanel>{panels[value]}</EditorRailPanel>}
    </TabPanel>
  ));
  if (!tabs.narrow)
    return (
      <EditorWorkspace
        page={page}
        rail={
          <TabsRoot value={tabs.railTab} onValueChange={tabs.show} className="flex min-h-0 min-w-0">
            <EditorRail
              head={<TabRow ariaLabel="Page tools" items={railItems(open)} />}
              foot={composer}
            >
              {railPanels}
            </EditorRail>
          </TabsRoot>
        }
      />
    );
  return (
    <TabsRoot
      value={tabs.stackTab}
      onValueChange={tabs.showStack}
      className="flex min-h-0 flex-col"
    >
      <EditorStack
        tabs={
          <TabRow
            ariaLabel="Page workspace"
            items={[{ value: 'page' as const, label: 'Page' }, ...railItems(open)]}
          />
        }
      >
        <TabPanel value="page" forceMount className={EDITOR_RAIL_TAB}>
          {page}
        </TabPanel>
        {tabs.stackTab === 'page' ? null : <EditorRail foot={composer}>{railPanels}</EditorRail>}
      </EditorStack>
    </TabsRoot>
  );
}

function railItems(open: number | undefined) {
  return [
    { value: 'suggestions' as const, label: 'Suggestions', count: open },
    { value: 'chat' as const, label: 'Chat' },
    { value: 'outline' as const, label: 'Outline' },
    { value: 'seo' as const, label: 'SEO' },
  ];
}

function PageHead({
  status,
  draft,
  notice,
  canAsk,
  onAsk,
}: Readonly<{
  status: string;
  draft: PageDraft;
  notice: SuggestionChanges['notice'];
  canAsk: boolean;
  onAsk: () => void;
}>) {
  return (
    <>
      <Inline className="flex-wrap justify-between">
        <span className={textRole('caption')} aria-live="polite">
          {status}
        </span>
        <Inline className="flex-wrap">
          <Button variant="quiet" disabled={!canAsk} onClick={onAsk}>
            <Icon icon={Sparkles} />
            Ask AI
          </Button>
          {draft.draft ? (
            <>
              <Button variant="quiet" disabled={draft.saving} onClick={draft.discard}>
                <Icon icon={Undo2} />
                Discard
              </Button>
              <Button
                variant="primary"
                pending={draft.saving}
                pendingLabel="Saving…"
                onClick={draft.save}
              >
                Save changes
              </Button>
            </>
          ) : null}
        </Inline>
      </Inline>
      {notice ? <Notice tone={notice.tone}>{notice.message}</Notice> : null}
      {draft.moved && !draft.failure ? (
        <Notice tone="warning">
          The page changed since you started editing. Saving will be refused.
        </Notice>
      ) : null}
      {draft.failure ? <Notice kind="mutation" notice={draft.failure} /> : null}
    </>
  );
}
