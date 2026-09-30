/** Executive export consumes the same persisted overview shown in the application. */
import { commandCenterSchema } from '@citeladder/contracts/opportunities';
import type { z } from 'zod';

import { PdfReport } from '../billing/pdf.ts';
import type { Database } from '../db/database.ts';
import { jsonObject, strings } from '../db/json.ts';
import { notFound } from '../errors.ts';
import type { ProjectScope } from './brand-profile.ts';
import { commandCenter } from './command-center.ts';

type View = z.output<typeof commandCenterSchema>;
const metric = (value: number | null, suffix = '') =>
  value === null ? 'Unknown' : `${value}${suffix}`;
function evidenceCount(value: unknown): string {
  const count = jsonObject(value, 'evidence_summary').count;
  return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0
    ? `${count} persisted item(s)`
    : 'Unknown';
}

export async function renderExecutivePdf(view: View): Promise<Uint8Array> {
  const measurement = view.measurement;
  if (!view.report_available || measurement === null)
    throw notFound('Completed command-center measurement');
  const report = await PdfReport.create(`${view.project.brand_name} executive report`);
  report.title(`${view.project.brand_name} executive report`);
  report.text(
    `Completed ${measurement.completed_at}\n${view.stale ? 'Historical measurement' : 'Latest completed measurement'}`,
  );
  report.heading('Current state');
  report.table(
    ['Metric', 'Current', 'Comparable change'],
    [
      ['Visibility', metric(view.state.visibility.value), metric(view.state.visibility.delta)],
      [
        'Share of voice',
        metric(view.state.share_of_voice.value, '%'),
        metric(view.state.share_of_voice.delta),
      ],
      [
        'Deterministic rank',
        metric(view.state.brand_rank.value),
        metric(view.state.brand_rank.delta),
      ],
      [
        'Citation share',
        metric(view.track.citation_share.value, '%'),
        metric(view.track.citation_share.delta),
      ],
    ],
    [2, 1, 1],
  );
  report.heading('Movement');
  if (view.movements.length)
    report.table(
      ['Engine', 'Current', 'Previous', 'Change'],
      view.movements.map((row) => [
        row.label,
        metric(row.current),
        metric(row.previous),
        metric(row.delta),
      ]),
      [2, 1, 1, 1],
    );
  else report.text('No comparable run with the same measurement identity.');
  report.heading('Resolved actions and subsequent movement');
  report.text(
    `${view.resolved_actions.count} action(s) were marked resolved since the comparable run. Metric movement is presented alongside completion and does not establish causation.`,
  );
  report.heading('Next actions');
  if (view.actions.length)
    report.table(
      ['Rank', 'Action', 'Priority', 'Evidence'],
      view.actions.map((action) => [
        String(action.display_rank),
        action.title,
        String(action.priority_score),
        evidenceCount(action.evidence_summary),
      ]),
      [1, 6, 2, 2],
    );
  else report.text('No persisted actions are available.');
  report.newPage();
  report.title('Measurement scope and methodology');
  report.text(
    'Visibility, share of voice, and rank are deterministic projections of persisted audit artifacts. Deltas require matching benchmark mode, logical engines, frozen core-prompt identity, and processing versions. Unknown means no determinate value or valid comparison. An observed zero remains zero.',
  );
  report.text(
    `Audit: ${measurement.audit_id}\nComparable audit: ${measurement.comparable_audit_id ?? 'Unavailable'}\nBenchmark: ${measurement.benchmark_mode || 'Unknown'}\nEngines: ${measurement.logical_engines.join(', ') || 'Unavailable'}\nMetric snapshot: ${measurement.metric_snapshot_id ?? 'Unavailable'}\nAnalyzer: ${measurement.analyzer_version ?? 'Unknown'}\nScoring rules: ${measurement.scoring_rule_version ?? 'Unknown'}`,
  );
  for (const limitation of view.track.limitations) report.text(limitation);
  report.heading('Evidence appendix');
  for (const action of view.actions) {
    report.text(`${action.display_rank}. ${action.title}`, { bold: true });
    const evidence = jsonObject(action.evidence_summary, 'evidence_summary');
    const factors = jsonObject(action.priority_factors, 'priority_factors');
    report.text(
      `Action: ${action.id}\nTarget: ${action.target_label ?? 'Unknown'}\nEvidence types: ${strings(evidence.kinds).join(', ') || 'Unavailable'}\nFormula: ${factors.formula_version ?? 'Unknown'}`,
    );
  }
  for (const evidence of view.resolved_actions.evidence)
    report.text(
      `Resolved action: ${evidence.action_id}\nImplementation events: ${evidence.implementation_event_ids.join(', ') || 'Unavailable'}\nVerification events: ${evidence.verification_event_ids.join(', ') || 'Unavailable'}`,
    );
  return report.save();
}

export async function executiveReport(db: Database, scope: ProjectScope, auditId: string | null) {
  const view = commandCenterSchema.parse(await commandCenter(db, scope, auditId));
  const bytes = await renderExecutivePdf(view);
  const slug =
    view.project.brand_name
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, '-')
      .replaceAll(/^-|-$/gu, '') || 'report';
  return {
    bytes,
    filename: `citeladder-${slug}-${view.measurement!.completed_at.slice(0, 10)}.pdf`,
  };
}
