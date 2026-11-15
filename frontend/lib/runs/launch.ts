/**
 * Launch-dialog view-model + payload builder (F10).
 *
 * Turns the dialog's local selection state (a prompt set, a set of logical
 * engines, and a repetition count) into the `POST /audits` body (B5
 * `AuditCreate`). Pure + transport-free so the payload shape is unit-testable
 * independent of the dialog component.
 */
import type { AuditLaunchRequest } from '@citeladder/contracts/audit-requests';
import type { LogicalEngine, Prompt, PromptFormLimits, PromptSet } from '@citeladder/contracts';
import { DEFAULT_REPETITIONS } from '@/lib/config/operational';

export { DEFAULT_REPETITIONS } from '@/lib/config/operational';

/** The repetition range the API accepts, from the prompt-set list's limits. */
export type RepetitionLimits = Pick<
  PromptFormLimits,
  'audit_repetitions_min' | 'audit_repetitions_max'
>;

/** The dialog's local, still-being-edited selection. */
export type LaunchSelection = {
  projectId: string;
  promptSetId: string | null;
  promptIds?: string[];
  engines: LogicalEngine[];
  /** One run per market; `null` is the project default. Omitted measures the default only. */
  marketIds?: (string | null)[];
  repetitions: number;
  auditScope?: 'brand' | 'commerce';
};

/**
 * How many prompts one audit batch runs.
 *
 * A full portfolio is more than most people want to pay for or wait on in one
 * go, and the launch screen used to offer no choice: picking a prompt set ran
 * every prompt in it. Ten is a batch you can read the results of.
 */
export const PROMPT_BATCH_SIZE = 10;

/**
 * A prompt set's audit-eligible prompts, in the order the backend runs them.
 *
 * Mirrors the API's audit prompt resolution: active and
 * enabled only, ordered by creation. The order matters — batch 2 has to mean
 * the same ten prompts here as it does there, or "Prompts 11-20" would run an
 * arbitrary slice.
 */
export function auditablePrompts(promptSet: PromptSet | undefined): Prompt[] {
  return [...(promptSet?.prompts ?? [])]
    .filter((prompt) => prompt.enabled && prompt.status === 'active')
    .sort(
      (a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id),
    );
}

export type LaunchReadiness =
  | { kind: 'ready' }
  | { kind: 'checking' }
  | { kind: 'blocked'; reason: string };

/**
 * Whether Launch run can start, and why not: the one rule every entry reads.
 * A failed read stays launchable so the dialog can name the failure.
 */
export function launchReadiness(
  read:
    | { status: 'pending' }
    | { status: 'error' }
    | { status: 'success'; promptSets: readonly PromptSet[] },
): LaunchReadiness {
  switch (read.status) {
    case 'pending':
      return { kind: 'checking' };
    case 'error':
      return { kind: 'ready' };
    case 'success':
      return read.promptSets.some((set) => auditablePrompts(set).length > 0)
        ? { kind: 'ready' }
        : { kind: 'blocked', reason: 'Add an active prompt to launch a run.' };
    default:
      return read satisfies never;
  }
}

/** Split audit-eligible prompts into fixed-size batches. */
export function promptBatches(prompts: Prompt[], size = PROMPT_BATCH_SIZE): Prompt[][] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError('Prompt batch size must be a positive integer.');
  }
  const batches: Prompt[][] = [];
  for (let start = 0; start < prompts.length; start += size) {
    batches.push(prompts.slice(start, start + size));
  }
  return batches;
}

/** "Prompts 1-10" — 1-indexed and inclusive, the way the list reads on screen. */
export function batchLabel(index: number, batch: Prompt[], size = PROMPT_BATCH_SIZE): string {
  const first = index * size + 1;
  return `Prompts ${first}-${first + batch.length - 1}`;
}

/** Clamp a repetition count into the backend-accepted range. */
export function clampRepetitions(value: number, limits: RepetitionLimits): number {
  if (!Number.isFinite(value)) return DEFAULT_REPETITIONS;
  return Math.min(
    limits.audit_repetitions_max,
    Math.max(limits.audit_repetitions_min, Math.round(value)),
  );
}

/**
 * Why the selection cannot launch, or null when it can: a prompt set (or
 * fixed prompts), at least one engine and at least one market. The dialog
 * prints the reason beside its disabled Launch run. (The backend also requires
 * a configured provider route per engine; the dialog only offers configured engines.)
 */
export function launchBlocker(selection: LaunchSelection): string | null {
  if (!selection.promptSetId && !selection.promptIds?.length)
    return 'Choose a prompt set to launch a run.';
  if (!selection.engines.length) return 'Choose at least one engine to launch a run.';
  if (selection.marketIds?.length === 0) return 'Choose at least one market to launch a run.';
  return null;
}

/** Explicit prompts win over the prompt set; neither means nothing to launch. */
function launchPrompts(selection: LaunchSelection) {
  if (selection.promptIds?.length) return { prompt_ids: [...selection.promptIds] };
  if (selection.promptSetId) return { prompt_set_id: selection.promptSetId };
  return null;
}

/**
 * Build the `POST /audits` payload from a launchable selection. Throws if the
 * selection is not launchable — callers gate on `launchBlocker` first.
 */
export function buildLaunchPayload(
  selection: LaunchSelection,
  limits: RepetitionLimits,
): AuditLaunchRequest {
  const prompts = launchPrompts(selection);
  if (!prompts || launchBlocker(selection) !== null) {
    throw new Error('Cannot build a launch payload from an incomplete selection.');
  }
  return {
    project_id: selection.projectId,
    ...prompts,
    engines: [...selection.engines],
    ...(selection.marketIds ? { market_ids: [...selection.marketIds] } : {}),
    repetitions: clampRepetitions(selection.repetitions, limits),
    audit_scope: selection.auditScope ?? 'brand',
  };
}

/** Toggle a market in/out of the current selection (immutably); `null` is the default market. */
export function toggleMarket(markets: (string | null)[], market: string | null): (string | null)[] {
  return markets.includes(market) ? markets.filter((id) => id !== market) : [...markets, market];
}

/** Toggle a logical engine in/out of the current selection (immutably). */
export function toggleEngine(engines: LogicalEngine[], engine: LogicalEngine): LogicalEngine[] {
  return engines.includes(engine) ? engines.filter((e) => e !== engine) : [...engines, engine];
}
