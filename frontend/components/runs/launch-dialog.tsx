import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { promptsQueries } from '@/lib/api/prompts';
import { providerQueries, type providersApi } from '@/lib/api/providers';
import { useManagedPlan } from '@/lib/billing/entitlement-context';
import { runsMutations, runsQueries } from '@/lib/api/runs';
import type { Audit, LogicalEngine, PromptSet } from '@citeladder/contracts';
import { mainPromptSet } from '@/lib/prompts/prompt-sets';
import { isVerified } from '@/lib/providers/catalog';
import { useEngineCatalog } from '@/lib/providers/engines';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useProjectMarkets } from '@/lib/project/use-project-markets';
import {
  auditablePrompts,
  buildLaunchPayload,
  launchBlocker,
  DEFAULT_REPETITIONS,
  promptBatches,
} from '@/lib/runs/launch';

import { LaunchDialogView } from './launch-dialog-view';

function availableEngines(
  order: readonly LogicalEngine[],
  connections: Awaited<ReturnType<typeof providersApi.listConnections>> | undefined,
) {
  const verified = new Set<LogicalEngine>();
  for (const connection of connections ?? []) {
    if (!connection.active || !isVerified(connection)) continue;
    for (const route of connection.routes ?? []) {
      if (route.active !== false) verified.add(route.logical_engine);
    }
  }
  return order.filter((engine) => verified.has(engine));
}

function useLaunchEngines(open: boolean, workspaceId: string) {
  const managed = useManagedPlan();
  const catalog = useEngineCatalog();
  const connectionsQuery = useQuery({
    ...providerQueries.connections(workspaceId),
    enabled: open && !managed,
  });
  const configuredEngines = useMemo(
    () => (managed ? [...catalog.order] : availableEngines(catalog.order, connectionsQuery.data)),
    [managed, catalog.order, connectionsQuery.data],
  );
  return {
    configuredEngines,
    catalog,
    enginesReady: catalog.order.length > 0 && (managed || connectionsQuery.isSuccess),
  };
}

function fixedPromptSelection(
  fixedPromptSetId: string | undefined,
  fixedPromptIds: string[] | undefined,
  promptSelectionLabel: string | undefined,
) {
  const count = fixedPromptIds?.length ?? 0;
  const noun = count === 1 ? 'prompt' : 'prompts';
  return {
    locked: count > 0 || Boolean(fixedPromptSetId),
    label: promptSelectionLabel ?? (count ? `${count} selected ${noun}` : undefined),
  };
}

function batchSelection(
  promptSets: PromptSet[] | undefined,
  selectedPromptSetId: string | null,
  fixedPromptSetId: string | undefined,
  fixedPromptIds: string[] | undefined,
  batchIndex: number | null,
  locked: boolean,
) {
  const effectivePromptSetId =
    fixedPromptSetId ?? selectedPromptSetId ?? mainPromptSet(promptSets ?? [])?.id ?? null;
  const set = promptSets?.find((item) => item.id === effectivePromptSetId);
  const batches = locked ? [] : promptBatches(auditablePrompts(set));
  const selectedBatch = batchIndex === null ? undefined : batches[batchIndex];
  const selectedBatchMissing = batchIndex !== null && selectedBatch === undefined;
  return {
    effectivePromptSetId,
    batches,
    payloadPromptSetId: selectedBatchMissing ? null : effectivePromptSetId,
    promptIds: fixedPromptIds ?? selectedBatch?.map((prompt) => prompt.id),
  };
}

export function LaunchDialog({
  open,
  onOpenChange,
  projectId,
  onLaunched,
  fixedPromptSetId,
  fixedPromptIds,
  promptSelectionLabel,
  auditScope = 'brand',
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onLaunched?: (audit: Audit) => void;
  fixedPromptSetId?: string;
  fixedPromptIds?: string[];
  promptSelectionLabel?: string;
  auditScope?: 'brand' | 'commerce';
}>) {
  const { workspaceId } = useProjectScope();
  const promptSetsQuery = useQuery({
    ...promptsQueries.sets({ workspaceId, projectId }),
    enabled: open,
  });
  const { configuredEngines, enginesReady, catalog } = useLaunchEngines(open, workspaceId);
  const fixedSelection = fixedPromptSelection(
    fixedPromptSetId,
    fixedPromptIds,
    promptSelectionLabel,
  );
  const [promptSetId, setPromptSetId] = useState<string | null>(null);
  const [engines, setEngines] = useState<LogicalEngine[]>([]);
  const initialized = useRef(false);
  useEffect(() => {
    if (!open) {
      initialized.current = false;
      return;
    }
    if (!initialized.current && enginesReady) {
      initialized.current = true;
      setEngines(configuredEngines.filter(catalog.isObserved));
    }
  }, [open, enginesReady, configuredEngines, catalog]);
  const [repetitions, setRepetitions] = useState(DEFAULT_REPETITIONS);
  const markets = useProjectMarkets(projectId, workspaceId, open);
  const [marketIds, setMarketIds] = useState<(string | null)[]>([null]);
  const [connecting, setConnecting] = useState<LogicalEngine | 'any' | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setConnecting(null);
  }
  const [batchIndex, setBatchIndex] = useState<number | null>(null);
  const promptSelection = useMemo(
    () =>
      batchSelection(
        promptSetsQuery.data?.prompt_sets,
        promptSetId,
        fixedPromptSetId,
        fixedPromptIds,
        batchIndex,
        fixedSelection.locked,
      ),
    [
      promptSetsQuery.data,
      promptSetId,
      fixedPromptSetId,
      fixedPromptIds,
      batchIndex,
      fixedSelection.locked,
    ],
  );
  const selectedEngines = useMemo(
    () => engines.filter((engine) => configuredEngines.includes(engine)),
    [engines, configuredEngines],
  );
  const selection = {
    projectId,
    promptSetId: promptSelection.payloadPromptSetId,
    promptIds: promptSelection.promptIds,
    engines: selectedEngines,
    marketIds,
    repetitions,
    auditScope,
  };
  const limits = promptSetsQuery.data?.limits ?? null;
  const blocker = limits === null ? 'Checking the run limits…' : launchBlocker(selection);
  const ready = blocker === null;
  const estimateQuery = useQuery({
    ...runsQueries.estimate(
      workspaceId,
      ready && limits ? buildLaunchPayload(selection, limits) : null,
    ),
    enabled: open,
  });
  const reset = () => {
    setEngines([]);
    setPromptSetId(null);
    setRepetitions(DEFAULT_REPETITIONS);
    setMarketIds([null]);
    setBatchIndex(null);
  };
  const launchMutation = useMutation(runsMutations.launch(workspaceId));
  const launch = () => {
    if (!limits) return;
    launchMutation.mutate(buildLaunchPayload(selection, limits), {
      onSuccess: (audits) => {
        onOpenChange(false);
        reset();
        if (audits[0]) onLaunched?.(audits[0]);
      },
    });
  };
  const launchNotice = launchMutation.isError
    ? mutationNoticeForError(launchMutation.error, { action: 'launch the audit' })
    : null;

  return (
    <LaunchDialogView
      open={open}
      onOpenChange={onOpenChange}
      promptSets={promptSetsQuery.data?.prompt_sets ?? []}
      repetitionLimits={limits}
      promptSetsRead={promptSetsQuery}
      configuredEngines={configuredEngines}
      promptSetId={promptSelection.effectivePromptSetId}
      setPromptSetId={(id) => {
        setPromptSetId(id);
        setBatchIndex(null);
      }}
      batches={promptSelection.batches}
      batchIndex={batchIndex}
      setBatchIndex={setBatchIndex}
      engines={selectedEngines}
      setEngines={(update) =>
        setEngines(typeof update === 'function' ? update(selectedEngines) : update)
      }
      repetitions={repetitions}
      setRepetitions={setRepetitions}
      markets={markets}
      marketIds={marketIds}
      setMarketIds={setMarketIds}
      estimate={estimateQuery.data}
      launchPending={launchMutation.isPending}
      launchNotice={launchNotice}
      onLaunch={launch}
      connecting={connecting}
      setConnecting={setConnecting}
      promptSetLocked={fixedSelection.locked}
      promptSelectionLabel={fixedSelection.label}
      blocker={blocker}
    />
  );
}
