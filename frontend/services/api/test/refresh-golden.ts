/**
 * Golden adapters for the Opportunity refresh, its reads and the helpers it
 * shares with retained Python owners.
 *
 * `opportunity_refresh` and `opportunity_sources` are compared with Python
 * floats kept (`golden.test.ts` parses them with `parsePyJson`), because a
 * refresh persists that JSON. Inputs arrive with `PyFloat` marks; arithmetic
 * inputs are unwrapped here and the outputs Python holds as floats outside
 * persisted JSON (hit factors, scores) are marked again, so only persisted
 * JSON decides.
 */
import {
  answerIndex,
  pageEvidence,
  type Page,
  type Presence,
  type Snapshot,
} from '../src/opportunities/earned-page-hits.ts';
import { isGoogleSearchSurface } from '../src/analysis/opportunities/source-patterns.ts';
import type { DetectorHit, VisibilityEvidence } from '../src/analysis/opportunities/evidence.ts';
import { normalizedUrlForCompare } from '../src/analysis/url-compare.ts';
import { encodeKeysetCursor, filterFingerprint } from '../src/http/keyset-cursor.ts';
import { actionMember } from '../src/opportunities/action-sync.ts';
import {
  orderedItems,
  projectContentHandoff,
  projectDetail,
  projectExportRow,
  projectItem,
  type OpportunityRow,
} from '../src/opportunities/projection.ts';
import { historyGroup } from '../src/opportunities/reads.ts';
import {
  availableFamilies,
  buildSnapshot,
  newOpportunity,
  projectSnapshot,
  scoreHits,
  siteCoverage,
  snapshotIsCurrent,
  stampSourceProjections,
} from '../src/opportunities/refresh-compute.ts';
import { declineHit } from '../src/opportunities/refresh-evidence.ts';
import {
  changeHit,
  demandHit,
  missingFieldHit,
  unmentionedHits,
} from '../src/opportunities/refresh-hits.ts';
import { activationState, isStale } from '../src/opportunities/summary.ts';
import { projectLockKey } from '../src/prompts/locks.ts';
import { promptTextHash } from '../src/prompts/normalization.ts';
import { PyFloat, pyFloat } from '../src/python/text.ts';
import { passageTexts, projectRoster } from '../src/source-pages/reading.ts';

type Args = never[];
type Ports = Record<string, (...args: Args) => unknown>;

const num = (value: unknown): number =>
  value instanceof PyFloat ? value.value : (value as number);
const plainHit = (hit: DetectorHit): DetectorHit => ({
  ...hit,
  value_factor: num(hit.value_factor),
  gap_factor: num(hit.gap_factor),
});
const markedHit = (hit: DetectorHit | null) =>
  hit === null
    ? null
    : { ...hit, value_factor: pyFloat(hit.value_factor), gap_factor: pyFloat(hit.gap_factor) };
type Scored = [DetectorHit, unknown];
const plainScored = (scored: Scored[]) =>
  scored.map(([hit, score]) => [plainHit(hit), num(score)] as [DetectorHit, number]);
const plainNumbers = <T extends Record<string, unknown>>(row: T, fields: string[]): T =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, fields.includes(key) ? num(value) : value]),
  ) as T;

const refreshPorts: Ports = {
  coverage: siteCoverage,
  score: (hits: DetectorHit[]) =>
    scoreHits(hits.map(plainHit)).map(([hit, score]) => [markedHit(hit), pyFloat(score)]),
  new_row: (hit: DetectorHit, score: unknown) => {
    const row = newOpportunity(plainHit(hit), num(score));
    return { ...row, priority_score: pyFloat(row.priority_score) };
  },
  snapshot: (
    sources: Parameters<typeof buildSnapshot>[0],
    rows: Parameters<typeof buildSnapshot>[1],
    scored: Scored[],
    projections: Parameters<typeof buildSnapshot>[3],
  ) => {
    const { run_id: _run, ...fields } = buildSnapshot(
      sources,
      rows,
      plainScored(scored),
      projections,
    );
    return {
      ...fields,
      median_priority: fields.median_priority === null ? null : pyFloat(fields.median_priority),
    };
  },
  stamp: (
    auditId: string,
    snapshots: Parameters<typeof stampSourceProjections>[1],
    gaps: number[],
    projections: Record<string, unknown>[],
  ) => {
    stampSourceProjections(auditId, snapshots, gaps, projections);
    return projections;
  },
  current: snapshotIsCurrent,
  decline: (row: Parameters<typeof declineHit>[0], auditId: string) =>
    markedHit(
      declineHit(
        plainNumbers(row, [
          'immediate_delta',
          'engine_agreement',
          'repetition_agreement',
          'trend_confidence',
        ]),
        auditId,
      ),
    ),
  change: (pair: Parameters<typeof changeHit>[0], row: Parameters<typeof changeHit>[1]) =>
    markedHit(changeHit(pair, row)),
  demand: (snapshotId: string, signal: Parameters<typeof demandHit>[1]) =>
    markedHit(demandHit(snapshotId, plainNumbers(signal, ['priority_score']))),
  unmentioned: (snapshots: Parameters<typeof unmentionedHits>[0], auditId: string) =>
    unmentionedHits(
      snapshots.map((row) => plainNumbers(row, ['product_visibility'])),
      auditId,
    ).map(markedHit),
  missing_fields: (product: Parameters<typeof missingFieldHit>[0], ids: string[]) =>
    markedHit(missingFieldHit(product, ids)),
  families: (has: Parameters<typeof availableFamilies>[0]) => availableFamilies(has).sort(),
  member: (row: Parameters<typeof actionMember>[0]) => {
    const member = actionMember(plainNumbers(row, ['priority_score']));
    return { ...member, priority_score: pyFloat(member.priority_score) };
  },
  earned_page: (
    page: Page,
    snapshots: Snapshot[],
    presences: Record<string, Presence[]>,
    visibility: VisibilityEvidence,
    ids: string[],
    roster: string,
  ) =>
    pageEvidence(page, {
      snapshots,
      presences: new Map(Object.entries(presences)),
      answers: answerIndex(visibility),
      analysisIds: new Set(ids),
      roster,
    }),
};

const readPorts: Ports = {
  item: (row: OpportunityRow) => projectItem(row),
  detail: projectDetail,
  export_row: projectExportRow,
  ordered: orderedItems,
  handoff: projectContentHandoff,
  history_group: historyGroup,
  stale: isStale,
  activation: activationState,
  project_snapshot: projectSnapshot,
};

const sourcePorts: Ports = {
  roster: projectRoster,
  passages: passageTexts,
  prompt_hash: promptTextHash,
  lock_key: (id: string) => projectLockKey(id).toString(),
  fingerprint: filterFingerprint,
  cursor: encodeKeysetCursor,
  google_surface: isGoogleSearchSurface,
  url_compare: normalizedUrlForCompare,
};

function dispatch(ports: Ports, family: string) {
  return (input: { op: string; args: Args }): unknown => {
    const port = ports[input.op];
    if (!port) throw new Error(`Missing ${family} golden port: ${input.op}`);
    return port(...input.args);
  };
}

export const refreshGolden = dispatch(refreshPorts, 'opportunity_refresh');
export const readsGolden = dispatch(readPorts, 'opportunity_reads');
export const sourcesGolden = dispatch(sourcePorts, 'opportunity_sources');
