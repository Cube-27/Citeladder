import type { DatedEvidence } from '@/lib/agent/evidence';
import { checkKindLabel, checkStateLabel, measurementLegLabel } from '@/lib/agent/vocabulary';
import type { ActionDetail } from '@/lib/api/actions';

type Declaration = NonNullable<ActionDetail['declaration']>;

type TicketAction = Pick<ActionDetail, 'target_label' | 'target_url' | 'member_measurement'> & {
  handoff: Pick<ActionDetail['handoff'], 'message'>;
  members: readonly Pick<ActionDetail['members'][number], 'id' | 'title' | 'remediation'>[];
  diagnosis: Pick<ActionDetail['diagnosis'], 'donts'>;
  declaration:
    | (Pick<Declaration, 'declared_implemented_at' | 'deployed_by' | 'deployment_reference'> & {
        checks: readonly Pick<Declaration['checks'][number], 'kind' | 'state'>[];
      })
    | null;
};

const oneLine = (text: string) => text.replaceAll(/\s+/g, ' ').trim();
const line = (text: string) => `- ${oneLine(text)}`;
const list = (items: readonly string[], none: string) =>
  items.length ? items.map((item) => line(item)) : [line(none)];
const unique = (values: readonly string[]) => [...new Set(values.filter(Boolean))];

function verification(action: TicketAction, formatDate: (iso: string) => string): string[] {
  const { declaration } = action;
  if (declaration) {
    const by = declaration.deployed_by ?? 'a former workspace member';
    const reference = declaration.deployment_reference
      ? ` (${declaration.deployment_reference})`
      : '';
    return [
      `Deployed on ${formatDate(declaration.declared_implemented_at)}, recorded by ${by}${reference}.`,
      '',
      ...list(
        declaration.checks.map(
          (check) => `${checkKindLabel(check.kind)}: ${checkStateLabel(check)}`,
        ),
        'No automatic check applies; CiteLadder records the work but cannot verify it.',
      ),
    ];
  }
  return [
    ...action.members.map((member) => {
      const leg = action.member_measurement[member.id];
      const by = leg ? measurementLegLabel(leg) : null;
      const how = by ? 'checked by ' + by.toLowerCase() : 'no automatic check';
      return line(`${member.title}: ${how}`);
    }),
    '',
    'When it ships, record the deployment on the Action in CiteLadder: Mark implemented with the day it went live and the release, pull request or commit. Readings before that day are not counted.',
  ];
}

export function developerTicket(
  action: TicketAction,
  evidence: readonly DatedEvidence[],
  formatDate: (iso: string) => string,
): string {
  const findings = unique(action.members.map((member) => member.title));
  const steps = unique(action.members.map((member) => member.remediation));
  const donts = action.diagnosis.donts ?? [];
  const sections: string[][] = [
    [`# ${oneLine(action.target_label)}`, '', action.handoff.message],
    ['## Issue', '', ...list(findings, 'No current finding targets this Action.')],
    ['## Affected pages', '', line(action.target_url ?? action.target_label)],
    [
      '## Evidence',
      '',
      ...list(
        evidence.map(
          (item) =>
            `${item.label}: ${item.basis}, ${item.at ? formatDate(item.at) : 'date not recorded'}`,
        ),
        'No evidence is recorded for this Action.',
      ),
    ],
    [
      '## Minimal patch',
      '',
      ...(steps.length
        ? steps.map((step, index) => `${index + 1}. ${oneLine(step)}`)
        : [line('No step is recorded; see the issue above.')]),
      ...(donts.length ? ['', 'Avoid:', '', ...donts.map(line)] : []),
    ],
    ['## How it will be verified', '', ...verification(action, formatDate)],
  ];
  return `${sections.map((section) => section.join('\n')).join('\n\n')}\n`;
}
