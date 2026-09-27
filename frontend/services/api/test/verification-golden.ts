import { auditIdentity } from '../src/opportunities/verification-result.ts';
import { sourceRevision } from '../src/opportunities/verification.ts';
import { referralMeasurementLeg } from '../src/opportunities/verification-decisions.ts';
import {
  evaluation,
  evaluatePlacementCheck,
  evaluateTrafficMetric,
  evaluateVisibilityMetric,
  gapChanges,
  leg,
  metricMatches,
  observationKind,
  valueState,
  visibilityMeasurementLeg,
  type Evaluation,
} from '../src/opportunities/verification-decisions.ts';
function result(value: Evaluation) {
  return {
    observed: value.observed,
    matched: value.matched,
    contradicted: value.contradicted,
    analysis_ids: [...value.analysis_ids].sort(),
    rule_evaluation_ids: [...value.rule_evaluation_ids].sort(),
    metric_ids: [...value.metric_ids].sort(),
    limitations: value.limitations,
    observation_kind: observationKind(value, 1),
  };
}
const ports: Record<string, (...args: never[]) => unknown> = {
  state: valueState,
  leg,
  gaps: gapChanges,
  matches: metricMatches,
  revision: sourceRevision,
  audit_identity: auditIdentity,
  visibility_leg: visibilityMeasurementLeg,
  referral_leg: referralMeasurementLeg,
  observation: (
    partial: Pick<Evaluation, 'observed' | 'matched' | 'contradicted'>,
    total: number,
  ) => observationKind({ ...evaluation(), ...partial }, total),
  visibility: (
    snapshot: Parameters<typeof evaluateVisibilityMetric>[0] | null,
    check: Record<string, unknown>,
    index: number | null,
  ) => {
    const value = evaluation();
    evaluateVisibilityMetric(snapshot ?? undefined, check, index, value);
    return result(value);
  },
  traffic: (
    snapshot: Parameters<typeof evaluateTrafficMetric>[0] | null,
    check: Record<string, unknown>,
  ) => {
    const value = evaluation();
    evaluateTrafficMetric(snapshot ?? undefined, check, value);
    return result(value);
  },
  placement_check: (check: Parameters<typeof evaluatePlacementCheck>[0] | null) => {
    const value = evaluation();
    evaluatePlacementCheck(check ?? undefined, value);
    return result(value);
  },
};
export function verificationGolden(input: { op: string; args: never[] }): unknown {
  const port = ports[input.op];
  if (!port) throw new Error(`Missing verification golden port: ${input.op}`);
  return port(...input.args);
}
