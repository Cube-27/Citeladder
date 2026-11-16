import { ActionSection } from '@/components/agent/action-section';
import { DisplayTime } from '@/components/ui/display-time';
import { Stack } from '@/components/ui/layout';
import { OpenRow } from '@/components/ui/list-row';
import { StateBlock } from '@/components/ui/state-block';
import { StatusMark } from '@/components/ui/status-mark';
import { Tag } from '@/components/ui/tag';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { ledgerClasses, ledgerItemClasses } from '@/components/ui/workspace';
import { actionEvidence } from '@/lib/agent/evidence';
import type { ActionDetail } from '@/lib/api/actions';
import { severityLabel, severityPriority } from '@/lib/site-health/issues';
import type { OpportunityType } from '@citeladder/contracts';

const SOURCE_LABEL: Record<OpportunityType, string> = {
  visibility: 'Visibility',
  commerce: 'Commerce',
  site: 'Site',
  traffic: 'Traffic',
  topic: 'Topic',
};

/**
 * The Action's findings, one ruled row each (title, impact, the Inferred mark
 * a rule-derived finding carries, then source and date); a row opens its
 * evidence in the drawer, which shows only what the row does not. The
 * readings behind the Action follow, each linked to the screen that shows it.
 */
export function ActionFindings({
  action,
  onOpen,
}: Readonly<{ action: ActionDetail; onOpen: (id: string) => void }>) {
  const readings = actionEvidence(action).filter((record) => record.basis === 'observed');
  return (
    <ActionSection title="Findings" id="action-findings">
      {action.members.length === 0 ? (
        <StateBlock
          kind="empty"
          inline
          message={
            action.evidence_cleared_at
              ? 'No current evidence targets this Action. Its chats are kept.'
              : 'No current finding targets this Action.'
          }
        />
      ) : null}
      {action.members.length + readings.length > 0 ? (
        <ul aria-label="Findings" className={ledgerClasses()}>
          {action.members.map((member) => (
            <li key={member.id}>
              <OpenRow
                title={member.title}
                layout="stacked"
                opens="dialog"
                meta={
                  <>
                    <StatusMark variant="priority" value={severityPriority(member.severity)}>
                      {severityLabel(member.severity)} impact
                    </StatusMark>
                    <Tag>Inferred</Tag>
                  </>
                }
                caption={
                  <>
                    {SOURCE_LABEL[member.opportunity_type]} ·{' '}
                    <DisplayTime value={member.updated_at} dateOnly fallback="date not recorded" />
                  </>
                }
                onOpen={() => onOpen(member.id)}
              />
            </li>
          ))}
          {readings.map((record) => (
            // A reading CiteLadder took (a crawl, a declared check), linked where it has a screen.
            <Stack as="li" gap="tight" key={record.key} className={ledgerItemClasses()}>
              {record.href ? (
                <TextLink href={record.href} text="body" className="justify-self-start">
                  {record.label}
                </TextLink>
              ) : (
                <span className={textRole('body')}>{record.label}</span>
              )}
              <span className={textRole('caption', 'tabular-nums')}>
                Observed · <DisplayTime value={record.at} dateOnly fallback="date not recorded" />
              </span>
            </Stack>
          ))}
        </ul>
      ) : null}
    </ActionSection>
  );
}
