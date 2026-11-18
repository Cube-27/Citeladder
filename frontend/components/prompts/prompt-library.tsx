import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { promptsMutations } from '@/lib/api/prompts';
import type { ProjectScope } from '@/lib/api/query-keys/scope';
import { mutationNoticeForError, type MutationNotice } from '@/lib/api/mutation-notice';
import { topicsQueries } from '@/lib/api/topics';
import type { Prompt, PromptStatus, Topic } from '@citeladder/contracts';
import { useProjectHref } from '@/lib/navigation/project-destination';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import {
  brandOptions,
  emptyFilters,
  filterPrompts,
  personaOptions,
  sourceOptions,
  type PromptFilters,
} from '@/lib/prompts/filter';
import {
  formValuesToPromptInput,
  formValuesToPromptUpdate,
  type PromptFormValues,
} from '@/lib/prompts/forms';
import { PROMPT_BUILDER_HREF } from '@/lib/prompts/routes';
import { useRowSelection } from '@/lib/prompts/selection';
import { usePromptSet } from '@/lib/prompts/use-prompt-set';

import { PendingReviewNotice } from './candidate-review';
import { PromptEmptyState } from './prompt-empty-state';
import type { PendingDelete } from './confirm-delete-dialog';
import { PromptLibraryDialogs } from './prompt-library-dialogs';
import { usePromptEvidence, type PromptAnswerRef } from './prompt-evidence';
import { PromptBulkBar, usePromptBulk } from './prompt-bulk-bar';
import { PromptTable } from './prompt-table';
import { useLatestPromptMeasurements } from './use-latest-prompt-measurements';
import { ReportPage } from '@/components/templates/report-page';
import { FilterBar, type FilterBarProps } from '@/components/ui/filter-bar';

import { PromptActions, promptFilterControls } from './prompt-toolbar';
import { type TopicDialog, TopicDialogs, topicFilter } from './topic-controls';
import { useTopicMutations } from './use-topic-mutations';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useWorkspaceCapability } from '@/lib/project/project-context';

import { Notice } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

function mutationFailure(
  create: { isError: boolean; error: unknown },
  update: { isError: boolean; error: unknown },
): MutationNotice | undefined {
  if (create.isError) return mutationNoticeForError(create.error, { action: 'add the prompt' });
  return update.isError
    ? mutationNoticeForError(update.error, { action: 'save the prompt' })
    : undefined;
}

/**
 * A prompt's Enable/Disable. The new state shows at once, so a second press on a
 * row whose save is still in flight is ignored; rows save independently.
 */
function usePromptToggle(scope: ProjectScope) {
  const mutation = useMutation(promptsMutations.setEnabled(scope));
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const settle = (id: string) =>
    setSaving((current) => new Set([...current].filter((other) => other !== id)));
  const press = (prompt: Prompt) => {
    if (saving.has(prompt.id)) return;
    setSaving((current) => new Set(current).add(prompt.id));
    // Per-call promise: mutate's own callbacks fire only for the latest of overlapping calls.
    void mutation
      .mutateAsync({ promptId: prompt.id, enabled: !prompt.enabled })
      .catch(() => undefined)
      .finally(() => settle(prompt.id));
  };
  return { press, mutation };
}

/** Each topic's name by id; none until the topic list is read. */
function topicNamesOf(topics: readonly Topic[] | undefined) {
  return topics && new Map(topics.map((topic) => [topic.id, topic.name]));
}

/** A failed Enable/Disable; the row's status has already rolled back. */
function ToggleFailure({ toggle }: Readonly<{ toggle: { isError: boolean; error: unknown } }>) {
  if (!toggle.isError) return null;
  return (
    <Notice
      kind="mutation"
      notice={mutationNoticeForError(toggle.error, { action: 'turn the prompt on or off' })}
    />
  );
}

/**
 * Whether the library still shows its first-load frame. Prompts often arrive
 * with the project, before the latest run's figures; a run adds four columns,
 * and adding them beside rows already on screen moved every cell sideways.
 */
function awaitingFirstLoad(
  state: Readonly<{ promptsLoading: boolean; hasPrompts: boolean; figuresRead: boolean }>,
): boolean {
  return state.promptsLoading || (state.hasPrompts && !state.figuresRead);
}

const promptStatusCodec = stringUrlCodec<PromptStatus>(['active', 'archived'], 'active');

/** The library's body: the failed first read, the empty library, or the table. */
function libraryBodyFor({
  failedEmpty,
  hasPrompts,
  read,
  add,
  table,
}: Readonly<{
  failedEmpty: boolean;
  hasPrompts: boolean;
  read: Pick<ReturnType<typeof usePromptSet>, 'error' | 'retry' | 'retrying'>;
  add: ComponentProps<typeof PromptEmptyState>['add'];
  table: ReactNode;
}>): ReactNode {
  if (failedEmpty)
    return (
      <StateBlock
        kind="error"
        error={read.error}
        title="Couldn't load the prompts"
        fallback="Check your connection and try again."
        onRetry={read.retry}
        pending={read.retrying}
      />
    );
  return hasPrompts ? table : <PromptEmptyState add={add} />;
}

/**
 * The Brands and Sources choices once a run exists. An active choice stays
 * offered after a refresh that drops it, so it can still be cleared.
 */
function measuredChoicesFor({
  measurements,
  project,
  filters,
}: Readonly<{
  measurements: ReturnType<typeof useLatestPromptMeasurements>;
  project: Parameters<typeof brandOptions>[0];
  filters: PromptFilters;
}>) {
  if (!measurements?.size && !filters.brands.length && !filters.sources.length) return undefined;
  return {
    brands: brandOptions(project),
    sources: sourceOptions(measurements?.values() ?? [], filters.sources),
  };
}

/** A library that never held a prompt has nothing to sort, search or filter. */
function libraryFilterBar(hasPrompts: boolean, controls: FilterBarProps): ReactNode {
  return hasPrompts ? <FilterBar {...controls} /> : undefined;
}

/**
 * Prompt library client (F7). Owns the active prompt set (via F5 project
 * context), the topic/status/search filter state, and every CRUD, import,
 * lifecycle, and AI-generation mutation. Layout: one control row (Active /
 * Archived, search, Topic, filters) over the prompt table at the page's full
 * width; topics are added, renamed and deleted from the Topic menu's dialogs
 * (owner, 2026-11-06). "Prompt Builder" opens its own page, which steers
 * generation and reviews its suggestions.
 */
// react-doctor-disable-next-line react-doctor/no-giant-component -- this component only orchestrates queries/mutations; toolbar, topic rail, table, empty state, and dialogs are extracted.
export function PromptLibrary() {
  const { workspaceId, projectId, project } = useProjectScope();
  const scope = { workspaceId, projectId };
  // A role that may not edit prompts reads the library with no edit controls.
  const canWrite = useWorkspaceCapability('write');
  const {
    promptSet,
    prompts,
    setNames,
    commerceSetIds,
    limits,
    isLoading,
    error,
    ensurePromptSet,
    retry,
    retrying,
  } = usePromptSet();

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<PromptFilters>(emptyFilters);
  const [statusFilter, setStatusFilter] = useUrlState('status', promptStatusCodec);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Prompt | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const [topicDialog, setTopicDialog] = useState<TopicDialog | null>(null);
  const navigate = useNavigate();
  const projectHref = useProjectHref();

  const topicsQuery = useQuery(topicsQueries.list(scope));
  const topics: Topic[] = useMemo(() => topicsQuery.data ?? [], [topicsQuery.data]);
  const measurements = useLatestPromptMeasurements(scope);
  const evidence = usePromptEvidence();

  // Every descriptor refreshes the library's reads; these add the screen's own reaction.
  const closeForm = () => {
    setFormOpen(false);
    setEditing(undefined);
  };
  const createMutation = useMutation(promptsMutations.create(scope, ensurePromptSet));
  const updateMutation = useMutation(promptsMutations.update(scope));
  const deleteMutation = useMutation(promptsMutations.remove(scope));
  const rowMutation = useMutation(promptsMutations.update(scope));
  const toggle = usePromptToggle(scope);
  const importMutation = useMutation(promptsMutations.import(scope, ensurePromptSet));

  const topicMutations = useTopicMutations({
    scope,
    onDeleted: (topic) => {
      if (selectedTopicId === topic.id) setSelectedTopicId(null);
    },
  });

  // A fresh Add topic starts without the last attempt's error.
  const openAddTopic = () => {
    topicMutations.create.reset();
    setTopicDialog('add');
  };

  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  // Status -> topic -> search/filters, preserving order.
  const byStatus = useMemo(
    () => prompts.filter((prompt) => prompt.status === statusFilter),
    [prompts, statusFilter],
  );
  const byTopic = useMemo(
    () =>
      selectedTopicId === null
        ? byStatus
        : byStatus.filter((prompt) => prompt.topic_id === selectedTopicId),
    [byStatus, selectedTopicId],
  );
  const visible = useMemo(
    () => filterPrompts({ prompts: byTopic, search, filters, mentions: measurements }),
    [byTopic, search, filters, measurements],
  );
  // A filter change shows other rows, so it starts a new selection.
  const selection = useRowSelection(
    visible,
    JSON.stringify([statusFilter, selectedTopicId, search, filters]),
  );
  const bulk = usePromptBulk(scope, { topics, onDone: selection.clear });
  const confirmDelete = (pending: PendingDelete) => {
    switch (pending.kind) {
      case 'topic':
        return topicMutations.remove.mutate(pending.topic);
      case 'prompt':
        return deleteMutation.mutate(pending.prompt.id);
      case 'prompts':
        return bulk.run({ kind: 'delete' }, pending.prompts);
      default: {
        const unhandled: never = pending;
        return unhandled;
      }
    }
  };
  const personas = useMemo(() => personaOptions(prompts), [prompts]);
  const measuredChoices = useMemo(
    () => measuredChoicesFor({ measurements, project, filters }),
    [measurements, project, filters],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<PromptStatus, number> = { active: 0, archived: 0 };
    for (const prompt of prompts) counts[prompt.status] += 1;
    return counts;
  }, [prompts]);

  const hasPrompts = prompts.length > 0;

  const openAdd = () => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (prompt: Prompt) => {
    setEditing(prompt);
    setFormOpen(true);
  };
  const submitForm = async (values: PromptFormValues) => {
    const mutation = editing
      ? updateMutation.mutateAsync({
          promptId: editing.id,
          input: formValuesToPromptUpdate(values),
        })
      : createMutation.mutateAsync(formValuesToPromptInput(values));
    await mutation.then(closeForm, () => undefined);
  };
  const addPrompts = {
    onImport: () => setImportOpen(true),
    onAdd: openAdd,
    onGenerate: () => void navigate(projectHref(PROMPT_BUILDER_HREF)),
  };
  // Every edit control of the library, for a role that may edit prompts.
  const edits = canWrite
    ? {
        rows: {
          onEdit: openEdit,
          onDelete: (prompt: Prompt) => setPendingDelete({ kind: 'prompt', prompt }),
          onToggleEnabled: toggle.press,
          onSetStatus: (prompt: Prompt, status: PromptStatus) =>
            rowMutation.mutate({ promptId: prompt.id, input: { status } }),
          onEvidence: (prompt: Prompt, answer: PromptAnswerRef) =>
            evidence.open({ ...answer, promptText: prompt.text }),
        },
        add: addPrompts,
        topics: { onAdd: openAddTopic, onManage: () => setTopicDialog('manage') },
      }
    : undefined;

  // An empty library and a library filtered to nothing read differently: one
  // needs a way to add prompts, the other needs its filter loosened.
  // A failed read with nothing to show takes the empty state's slot; a failed
  // refresh keeps the prompts already shown and says so above them.
  const failedEmpty = Boolean(error) && !hasPrompts;
  const libraryBody = libraryBodyFor({
    failedEmpty,
    hasPrompts,
    read: { error, retry, retrying },
    add: edits?.add,
    table: (
      <>
        <PromptBulkBar
          shown={visible.length}
          selected={selection.selected}
          topics={topics}
          max={limits?.bulk_prompts_max ?? 0}
          pending={bulk.pending}
          onClear={selection.clear}
          onChange={(change) => bulk.run(change, selection.selected)}
          onDelete={() => setPendingDelete({ kind: 'prompts', prompts: selection.selected })}
        />
        <PromptTable
          prompts={visible}
          actions={edits?.rows}
          selection={edits ? selection : undefined}
          measurements={measurements}
          setNames={setNames}
          topicNames={topicNamesOf(topicsQuery.data)}
          commerceSetIds={commerceSetIds}
        />
      </>
    ),
  });

  // Status, search and filters share one control band once loaded; the first
  // load holds it so the table starts where the box stood.
  const figuresRead = measurements !== undefined;
  if (awaitingFirstLoad({ promptsLoading: isLoading, hasPrompts, figuresRead })) {
    return (
      <ReportPage filters={<FilterBar />}>
        <StateBlock kind="loading" label="Loading prompts…" shape={{ kind: 'table', columns: 8 }} />
      </ReportPage>
    );
  }

  return (
    <ReportPage
      actions={<PromptActions add={addPrompts} inEmptyState={!hasPrompts && !failedEmpty} />}
      filters={libraryFilterBar(
        hasPrompts,
        promptFilterControls({
          status: { value: statusFilter, counts: statusCounts, onChange: setStatusFilter },
          search,
          onSearchChange: setSearch,
          filters,
          onFiltersChange: setFilters,
          personas,
          measured: measuredChoices,
          topic: topicFilter({
            topics,
            selectedTopicId,
            onSelect: setSelectedTopicId,
            manage: edits?.topics,
          }),
        }),
      )}
    >
      <>
        {error && !failedEmpty ? (
          <Notice
            kind="read"
            error={error}
            title="Couldn't refresh the prompts"
            fallback="The prompts below are from the last successful read."
            onRetry={retry}
            pending={retrying}
          />
        ) : null}
        <ToggleFailure toggle={toggle.mutation} />
        <PendingReviewNotice scope={scope} promptSet={promptSet} hidden={!canWrite} />

        <TopicDialogs
          dialog={topicDialog}
          onDialogChange={setTopicDialog}
          topics={topics}
          mutations={topicMutations}
          // One error per region: a failed library read already says the page failed.
          loadError={topicsQuery.isError && !failedEmpty}
          onAdd={openAddTopic}
          onDelete={(topic) => setPendingDelete({ kind: 'topic', topic })}
        />
        {libraryBody}
        {evidence.drawer}

        <PromptLibraryDialogs
          pendingDelete={pendingDelete}
          setPendingDelete={setPendingDelete}
          confirmDelete={confirmDelete}
          formOpen={formOpen}
          setFormOpen={setFormOpen}
          editing={editing}
          setEditing={setEditing}
          submitForm={submitForm}
          isSaving={createMutation.isPending || updateMutation.isPending}
          formError={mutationFailure(createMutation, updateMutation)}
          importOpen={importOpen}
          setImportOpen={setImportOpen}
          importPrompts={async (rows) => {
            await importMutation.mutateAsync(rows).then(
              () => setImportOpen(false),
              () => undefined,
            );
          }}
          isImporting={importMutation.isPending}
          importError={
            importMutation.isError
              ? mutationNoticeForError(importMutation.error, { action: 'import the prompts' })
              : undefined
          }
          topics={topics}
          selectedTopicId={selectedTopicId}
          limits={limits}
        />
      </>
    </ReportPage>
  );
}
