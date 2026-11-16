import { useMutation, useQuery } from '@tanstack/react-query';
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';

import { promptsMutations } from '@/lib/api/prompts';
import type { PromptGenerateRequest } from '@citeladder/contracts/prompt-requests';
import { mutationNoticeForError, type MutationNotice } from '@/lib/api/mutation-notice';
import { topicsQueries } from '@/lib/api/topics';
import type { Prompt, PromptStatus, Topic } from '@citeladder/contracts';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import {
  emptyFilters,
  filterPrompts,
  personaOptions,
  type PromptFilters,
} from '@/lib/prompts/filter';
import {
  formValuesToPromptInput,
  formValuesToPromptUpdate,
  type PromptFormValues,
} from '@/lib/prompts/forms';
import { usePromptCandidates } from '@/lib/prompts/use-prompt-candidates';
import { usePromptSet } from '@/lib/prompts/use-prompt-set';

import { PendingReviewNotice } from './candidate-review';
import { PromptEmptyState } from './prompt-empty-state';
import type { PendingDelete } from './confirm-delete-dialog';
import { PromptLibraryDialogs } from './prompt-library-dialogs';
import { usePromptEvidence, type PromptAnswerRef } from './prompt-evidence';
import { PromptTable } from './prompt-table';
import { useLatestPromptMeasurements } from './use-latest-prompt-measurements';
import { ReportPage } from '@/components/templates/report-page';
import { FilterBar, type FilterBarProps } from '@/components/ui/filter-bar';

import { PromptActions, promptFilterControls } from './prompt-toolbar';
import { type TopicDialog, TopicDialogs, topicFilter } from './topic-controls';
import { useTopicMutations } from './use-topic-mutations';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useWorkspaceCapability } from '@/lib/project/project-context';

import type { BuilderStep } from './prompt-builder';
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
 * (owner, 2026-11-06). "Prompt Builder" opens the sheet that steers
 * generation and reviews its suggestions.
 */
// react-doctor-disable-next-line react-doctor/no-giant-component -- this component only orchestrates queries/mutations; toolbar, topic rail, table, empty state, and dialogs are extracted.
export function PromptLibrary({
  generateRequest = 0,
  reviewRequest = false,
  offeringRequest = null,
}: Readonly<{
  /** Increments once per URL request to open the Prompt Builder. */
  generateRequest?: number;
  reviewRequest?: boolean;
  /** The offering a URL request opens the business step on. */
  offeringRequest?: string | null;
}>) {
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
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderStep, setBuilderStep] = useState<BuilderStep>('business');
  const [builderOffering, setBuilderOffering] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [topicDialog, setTopicDialog] = useState<TopicDialog | null>(null);
  const hasCompetitors = project.competitors.length > 0;

  const topicsQuery = useQuery(topicsQueries.list(scope));
  const topics: Topic[] = useMemo(() => topicsQuery.data ?? [], [topicsQuery.data]);
  const measurements = useLatestPromptMeasurements(scope);
  const evidence = usePromptEvidence();

  const review = usePromptCandidates({
    projectId,
    promptSet,
    workspaceId,
    onAccepted: () => {
      setStatusFilter('active');
      // Show every newly tracked prompt, whichever topic it landed in.
      setSelectedTopicId(null);
    },
  });

  // Every descriptor refreshes the library's reads; these add the screen's own reaction.
  const closeForm = () => {
    setFormOpen(false);
    setEditing(undefined);
  };
  const clearBusy = { onSettled: () => setBusyId(null) };
  const createMutation = useMutation(promptsMutations.create(scope, ensurePromptSet));
  const updateMutation = useMutation(promptsMutations.update(scope));
  const deleteMutation = useMutation(promptsMutations.remove(scope));
  const rowMutation = useMutation(promptsMutations.update(scope));
  const importMutation = useMutation(promptsMutations.import(scope, ensurePromptSet));

  // A retry of the same request after a failure reuses its key, so a run the
  // server already staged is replayed instead of drafted (and paid for) again.
  const generateKey = useRef<{ request: string; key: string } | null>(null);
  const generateMutation = useMutation(promptsMutations.generate(scope, ensurePromptSet));
  const generatePrompts = async (input: PromptGenerateRequest) => {
    const request = JSON.stringify(input);
    if (generateKey.current?.request !== request)
      generateKey.current = { request, key: crypto.randomUUID() };
    const result = await generateMutation
      .mutateAsync({ input, idempotencyKey: generateKey.current.key })
      .catch(() => null);
    if (result === null) return null;
    // Only this request's key retires; a different pending request keeps its own.
    if (generateKey.current?.request === request) generateKey.current = null;
    review.clearNotice();
    return result;
  };
  // A fresh open clears the last run's outcome, but never a run still in
  // flight: resetting it would drop `isPending` and allow a second paid run.
  const openBuilder = (step: BuilderStep, offering: string | null = null) => {
    if (!generateMutation.isPending) generateMutation.reset();
    setBuilderStep(step);
    setBuilderOffering(offering);
    setBuilderOpen(true);
  };
  const openFromUrl = useEffectEvent((step: BuilderStep) => openBuilder(step, offeringRequest));
  useEffect(() => {
    if (generateRequest === 0 || !canWrite) return;
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- open the builder for a URL request.
    openFromUrl(reviewRequest ? 'review' : 'business');
  }, [generateRequest, reviewRequest, canWrite]);

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
  const confirmDelete = (pending: PendingDelete) => {
    if (pending.kind === 'topic') return topicMutations.remove.mutate(pending.topic);
    setBusyId(pending.prompt.id);
    deleteMutation.mutate(pending.prompt.id, clearBusy);
  };

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
    () => filterPrompts(byTopic, search, filters),
    [byTopic, search, filters],
  );
  const personas = useMemo(() => personaOptions(prompts), [prompts]);

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
    onGenerate: () => openBuilder('business'),
  };
  // Every edit control of the library, for a role that may edit prompts.
  const edits = canWrite
    ? {
        rows: {
          onEdit: openEdit,
          onDelete: (prompt: Prompt) => setPendingDelete({ kind: 'prompt', prompt }),
          onToggleEnabled: (prompt: Prompt) => {
            setBusyId(prompt.id);
            rowMutation.mutate(
              { promptId: prompt.id, input: { enabled: !prompt.enabled } },
              clearBusy,
            );
          },
          onSetStatus: (prompt: Prompt, status: PromptStatus) => {
            setBusyId(prompt.id);
            rowMutation.mutate({ promptId: prompt.id, input: { status } }, clearBusy);
          },
          onEvidence: (prompt: Prompt, answer: PromptAnswerRef) =>
            evidence.open({ ...answer, promptText: prompt.text }),
          busyId,
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
      <PromptTable
        prompts={visible}
        actions={edits?.rows}
        measurements={measurements}
        setNames={setNames}
        commerceSetIds={commerceSetIds}
      />
    ),
  });

  // Status, search and filters share one control band once loaded; the first
  // load holds it so the table starts where the box stood.
  const figuresRead = measurements !== undefined;
  if (awaitingFirstLoad({ promptsLoading: isLoading, hasPrompts, figuresRead })) {
    return (
      <ReportPage filters={<FilterBar />}>
        <StateBlock kind="loading" label="Loading prompts…" shape={{ kind: 'table', columns: 7 }} />
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
        <PendingReviewNotice
          count={review.candidates.length}
          hidden={builderOpen || !canWrite}
          onReview={() => openBuilder('review')}
        />

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
          projectId={projectId}
          workspaceId={workspaceId}
          builderOpen={builderOpen}
          setBuilderOpen={setBuilderOpen}
          builderStep={builderStep}
          builderOffering={builderOffering}
          hasCompetitors={hasCompetitors}
          topics={topics}
          selectedTopicId={selectedTopicId}
          generatePrompts={generatePrompts}
          isGenerating={generateMutation.isPending}
          generateError={generateMutation.isError ? generateMutation.error : undefined}
          review={review}
          setsLoading={isLoading}
          setsError={error !== null}
          retrySets={retry}
          limits={limits}
        />
      </>
    </ReportPage>
  );
}
