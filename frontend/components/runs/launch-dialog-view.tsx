import { useId } from 'react';

import { ProviderList } from '@/components/providers/provider-list';
import { ACTIONS } from '@/components/ui/actions';
import { Button, IconButton } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, FieldRow } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Inline, Stack } from '@/components/ui/layout';
import { Select } from '@/components/ui/select';
import { Check, Plus, X, type IconGlyph } from '@/lib/icons';
import type { MutationNotice as MutationNoticeData } from '@/lib/api/mutation-notice';
import type { LogicalEngine, Prompt, PromptSet } from '@citeladder/contracts';
import type { ProjectMarket } from '@citeladder/contracts/markets';
import { useEngineCatalog } from '@/lib/providers/engines';
import {
  batchLabel,
  clampRepetitions,
  toggleEngine,
  toggleMarket,
  type RepetitionLimits,
} from '@/lib/runs/launch';
import { textRole } from '@/components/ui/typography';
import { Notice, readErrorProps, type RetryableRead } from '@/components/ui/notice';
import { wellClasses } from '@/components/ui/slip';

/** The prompt-set list read, kept apart from the list it yields. */
type PromptSetsRead = RetryableRead & Readonly<{ status: 'pending' | 'error' | 'success' }>;

type Estimate = {
  execution_count: number;
  maximum_attempt_count: number;
  maximum_wall_clock_seconds: number;
  cost_status: string;
  estimated_total_cost_microusd: number | null;
};

/**
 * The prompt selection: a locked, named one, or the project's prompt sets.
 *
 * "Locked" is one contract with the launch payload — whenever the caller fixes
 * the prompts (a prompt set OR an explicit id list), the field states what will
 * run instead of offering a control whose value the payload would ignore. A
 * locked field never reads the prompt-set list, so an empty list is not the
 * caller's problem and "add prompts first" would be the wrong advice.
 */
function PromptSetField({
  promptSets,
  promptSetsRead,
  promptSetId,
  setPromptSetId,
  promptSetLocked,
  promptSelectionLabel,
}: Readonly<{
  promptSets: PromptSet[];
  promptSetsRead: PromptSetsRead;
  promptSetId: string | null;
  setPromptSetId: (id: string) => void;
  promptSetLocked?: boolean;
  promptSelectionLabel?: string;
}>) {
  const locked = Boolean(promptSetLocked) || Boolean(promptSelectionLabel);
  const label =
    promptSelectionLabel ??
    promptSets.find((set) => set.id === promptSetId)?.name ??
    'Commerce Product Visibility';
  return (
    <Field label="Prompt set" required layout="row">
      {(props) => {
        if (locked) {
          return <p className={textRole('body', 'text-ink-2')}>{label}</p>;
        }
        // A failed list is not an empty one: "add prompts first" would send a
        // reader with many prompt sets off to recreate them.
        if (promptSetsRead.status === 'error') {
          return (
            <Notice
              kind="read"
              {...readErrorProps(promptSetsRead)}
              title="Couldn't load this project's prompt sets"
              fallback="The request failed or timed out."
            />
          );
        }
        if (promptSetsRead.status === 'success' && !promptSets.length) {
          return (
            <p className="type-body text-ink-2">
              No prompt set yet. Add prompts on the Prompts screen first.
            </p>
          );
        }
        return (
          <Select
            {...props}
            ariaLabel="Prompt set"
            value={promptSetId ?? ''}
            onValueChange={setPromptSetId}
            options={promptSets.map((set) => ({
              value: set.id,
              label: promptSetLabel(set),
            }))}
          />
        );
      }}
    </Field>
  );
}

/**
 * Which slice of the set to run.
 *
 * Only offered when there is more than one batch, unless a refresh invalidated
 * a prior choice. In that case it stays visible so the user can explicitly
 * recover to "All prompts" without silently broadening the launch.
 */
function BatchField({
  batches,
  batchIndex,
  setBatchIndex,
}: Readonly<{
  batches: Prompt[][];
  batchIndex: number | null;
  setBatchIndex: (index: number | null) => void;
}>) {
  if (batches.length < 2 && batchIndex === null) return null;
  const total = batches.reduce((count, batch) => count + batch.length, 0);
  return (
    <Field label="Prompts to run" layout="row">
      {(props) => (
        <Select
          {...props}
          ariaLabel="Prompts to run"
          value={batchIndex === null ? 'all' : String(batchIndex)}
          onValueChange={(value) => setBatchIndex(value === 'all' ? null : Number(value))}
          options={[
            { value: 'all', label: `All ${total} prompts` },
            ...batches.map((batch, index) => ({
              value: String(index),
              label: batchLabel(index, batch),
            })),
          ]}
        />
      )}
    </Field>
  );
}

/**
 * Provider setup inside the launch dialog, instead of a second dialog stacked
 * on this one. It grows inside the dialog body, the one scroll, and a verified
 * save refreshes the shared connections query, which turns the engine chips on
 * without leaving the dialog. Run probe offers it too when no key can probe.
 */
export function InlineProviderSetup({
  connecting,
  onClose,
  compact = false,
}: Readonly<{ connecting: LogicalEngine | 'any'; onClose: () => void; compact?: boolean }>) {
  const engine = connecting === 'any' ? null : connecting;
  return (
    <Stack as="section" gap="item" aria-label="Connect a provider" className={wellClasses()}>
      <Inline className="justify-between">
        <p className={textRole('body', 'text-ink-2')}>Connect a provider</p>
        <IconButton icon={X} label="Close provider setup" onClick={onClose} />
      </Inline>
      {/* Keyed by engine so clicking another engine opens its provider. */}
      <ProviderList key={engine ?? 'any'} expandEngine={engine} compact={compact} />
    </Stack>
  );
}

/**
 * Which markets to measure from: one run each. Only offered once the project
 * has more than its default market.
 */
function MarketsField({
  markets,
  marketIds,
  setMarketIds,
}: Readonly<{
  markets: readonly ProjectMarket[];
  marketIds: (string | null)[];
  setMarketIds: React.Dispatch<React.SetStateAction<(string | null)[]>>;
}>) {
  if (markets.length < 2) return null;
  return (
    <ChoiceRow label="Markets">
      <Inline className="flex-wrap">
        {markets.map((market) => (
          <ChoiceChip
            key={market.id ?? 'default'}
            selected={marketIds.includes(market.id)}
            onClick={() => setMarketIds((current) => toggleMarket(current, market.id))}
          >
            {market.label}
          </ChoiceChip>
        ))}
      </Inline>
      <p className="type-caption">
        Each market runs separately. An engine that cannot measure a market is skipped there.
      </p>
    </ChoiceRow>
  );
}

/**
 * A required chip group as a label-left row: the fieldset is the control
 * column, named by the label beside it.
 */
function ChoiceRow({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  const labelId = useId();
  return (
    <FieldRow label={label} required labelId={labelId}>
      <Stack as="fieldset" gap="item" aria-labelledby={labelId}>
        {children}
      </Stack>
    </FieldRow>
  );
}

/**
 * One chip anatomy for every choice in the dialog (engines and markets): a
 * selected chip shows a check and the pressed tint; an unselected one may
 * lead with its own glyph (Plus for an engine still to connect).
 */
function ChoiceChip({
  selected,
  onClick,
  leading,
  children,
}: Readonly<{
  selected: boolean;
  onClick: () => void;
  leading?: IconGlyph;
  children: React.ReactNode;
}>) {
  const glyph = selected ? Check : leading;
  return (
    <Button variant="secondary" aria-pressed={selected} onClick={onClick}>
      {glyph ? <Icon icon={glyph} /> : null}
      {children}
    </Button>
  );
}

/** A disabled primary names its reason to assistive tech only (owner, 2026-11-21: no helper text). */
function LaunchFooter({
  blocker,
  pending,
  onLaunch,
  onCancel,
}: Readonly<{
  blocker: string | null;
  pending: boolean;
  onLaunch: () => void;
  onCancel: () => void;
}>) {
  const reasonId = useId();
  return (
    <>
      {blocker ? (
        <span id={reasonId} className="sr-only">
          {blocker}
        </span>
      ) : null}
      <Button variant="quiet" onClick={onCancel}>
        <Icon icon={X} />
        Cancel
      </Button>
      <Button
        variant="primary"
        onClick={onLaunch}
        disabled={blocker !== null || pending}
        aria-describedby={blocker ? reasonId : undefined}
      >
        {pending ? 'Launching…' : ACTIONS.launchRun.label}
      </Button>
    </>
  );
}

function RepetitionsField({
  repetitions,
  setRepetitions,
  limits,
}: Readonly<{
  repetitions: number;
  setRepetitions: React.Dispatch<React.SetStateAction<number>>;
  limits: RepetitionLimits | null;
}>) {
  return (
    <Field label="Repetitions" layout="row">
      {(props) => (
        <Input
          {...props}
          type="number"
          min={limits?.audit_repetitions_min}
          max={limits?.audit_repetitions_max}
          value={repetitions}
          onChange={(event) => setRepetitions(Number(event.target.value))}
          onBlur={() => {
            if (limits) setRepetitions((current) => clampRepetitions(current, limits));
          }}
        />
      )}
    </Field>
  );
}

function EstimateNote({ estimate }: Readonly<{ estimate: Estimate }>) {
  return (
    <Stack gap="tight" className={wellClasses('type-caption')}>
      <span className={textRole('emphasis', 'text-ink')}>
        {estimate.execution_count} {estimate.execution_count === 1 ? 'response' : 'responses'}{' '}
        planned
      </span>
      <span className="text-ink-2">
        Maximum wall-clock budget {estimate.maximum_wall_clock_seconds}s · cost{' '}
        {estimate.cost_status}
        {estimate.estimated_total_cost_microusd !== null
          ? ` · ~$${(estimate.estimated_total_cost_microusd / 1_000_000).toFixed(4)}`
          : ' · unavailable'}
      </span>
    </Stack>
  );
}

/** A prompt set names its size only when the server counted it. */
function promptSetLabel(set: Readonly<{ name: string; prompt_count?: number | null }>): string {
  const count = typeof set.prompt_count === 'number' ? ` (${set.prompt_count})` : '';
  return `${set.name}${count}`;
}

export function LaunchDialogView({
  open,
  onOpenChange,
  promptSets,
  promptSetsRead,
  configuredEngines,
  promptSetId,
  setPromptSetId,
  batches,
  batchIndex,
  setBatchIndex,
  engines,
  setEngines,
  repetitions,
  setRepetitions,
  repetitionLimits,
  markets,
  marketIds,
  setMarketIds,
  estimate,
  launchPending,
  launchNotice,
  onLaunch,
  connecting,
  setConnecting,
  promptSetLocked,
  promptSelectionLabel,
  blocker,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promptSets: PromptSet[];
  promptSetsRead: PromptSetsRead;
  configuredEngines: LogicalEngine[];
  promptSetId: string | null;
  setPromptSetId: (id: string) => void;
  batches: Prompt[][];
  batchIndex: number | null;
  setBatchIndex: (index: number | null) => void;
  engines: LogicalEngine[];
  setEngines: React.Dispatch<React.SetStateAction<LogicalEngine[]>>;
  repetitions: number;
  setRepetitions: React.Dispatch<React.SetStateAction<number>>;
  /** The range the API accepts, from the prompt-set list; null until it loads. */
  repetitionLimits: RepetitionLimits | null;
  markets: readonly ProjectMarket[];
  marketIds: (string | null)[];
  setMarketIds: React.Dispatch<React.SetStateAction<(string | null)[]>>;
  estimate?: Estimate;
  launchPending: boolean;
  launchNotice: MutationNoticeData | null;
  onLaunch: () => void;
  connecting: LogicalEngine | 'any' | null;
  setConnecting: (target: LogicalEngine | 'any' | null) => void;
  promptSetLocked?: boolean;
  promptSelectionLabel?: string;
  /** Why Launch run is disabled, or null when the selection can launch. */
  blocker: string | null;
}>) {
  const catalog = useEngineCatalog();
  const selected = new Set(engines);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Launch a run"
      width="prose"
      footer={
        <LaunchFooter
          blocker={blocker}
          pending={launchPending}
          onLaunch={onLaunch}
          onCancel={() => onOpenChange(false)}
        />
      }
    >
      <Stack gap="workspace">
        {launchNotice ? <Notice kind="mutation" notice={launchNotice} onRetry={onLaunch} /> : null}
        <PromptSetField
          promptSets={promptSets}
          promptSetsRead={promptSetsRead}
          promptSetId={promptSetId}
          setPromptSetId={setPromptSetId}
          promptSetLocked={promptSetLocked}
          promptSelectionLabel={promptSelectionLabel}
        />
        <BatchField batches={batches} batchIndex={batchIndex} setBatchIndex={setBatchIndex} />
        <RepetitionsField
          repetitions={repetitions}
          setRepetitions={setRepetitions}
          limits={repetitionLimits}
        />
        <ChoiceRow label="Engines">
          {[true, false].map((consumer) => (
            <Stack key={String(consumer)} gap="item">
              <p className={textRole('captionStrong')}>
                {consumer ? 'Consumer experiences' : 'APIs'}
              </p>
              <Inline className="flex-wrap">
                {catalog.order
                  .filter((engine) => catalog.isObserved(engine) === consumer)
                  .map((engine) => {
                    const connected = configuredEngines.includes(engine);
                    return (
                      <ChoiceChip
                        key={engine}
                        selected={selected.has(engine)}
                        leading={connected ? undefined : Plus}
                        onClick={() =>
                          connected
                            ? setEngines((current) => toggleEngine(current, engine))
                            : setConnecting(engine)
                        }
                      >
                        {catalog.label(engine)}
                        {connected ? null : <span className="sr-only">, not connected</span>}
                      </ChoiceChip>
                    );
                  })}
              </Inline>
            </Stack>
          ))}
          {connecting ? (
            <InlineProviderSetup
              connecting={connecting}
              onClose={() => setConnecting(null)}
              compact
            />
          ) : null}
        </ChoiceRow>
        <MarketsField markets={markets} marketIds={marketIds} setMarketIds={setMarketIds} />
        {estimate ? <EstimateNote estimate={estimate} /> : null}
        <p className="type-caption text-ink-2">
          Answers that mention you or a competitor are also classified for sentiment. No credits are
          used.
        </p>
      </Stack>
    </Dialog>
  );
}
