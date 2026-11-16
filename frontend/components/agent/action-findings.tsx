import { ChevronRight } from 'lucide-react';

import { ActionSection } from '@/components/agent/action-section';
import { DisplayTime } from '@/components/ui/display-time';
import { Icon } from '@/components/ui/icon';
import { Stack } from '@/components/ui/layout';
import { StateBlock } from '@/components/ui/state-block';
import { StatusMark } from '@/components/ui/status-mark';
import { Tag } from '@/components/ui/tag';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { ledgerClasses } from '@/components/ui/workspace';
import { actionEvidence, type DatedEvidence } from '@/lib/agent/evidence';
import type { ActionDetail } from '@/lib/api/actions';
import { severityLabel, severityPriority } from '@/lib/site-health/issues';
import { cn } from '@/lib/utils';
import type { OpportunityType } from '@citeladder/contracts';

const SOURCE_LABEL: Record<OpportunityType, string> = {
  visibility: 'Visibility',
  commerce: 'Commerce',
  site: 'Site',
  traffic: 'Traffic',
  topic: 'Topic',
};

type Member = ActionDetail['members'][number];

/** A row is 56: its title over a subline, 8 above and below. */
const ROW = 'min-h-14 min-w-0 py-2';

/**
 * The Action's findings, one ruled row each (title, impact, source, date and
 * the Inferred mark a rule-derived finding carries); a row opens its evidence
 * in the drawer, which shows only what the row does not. The readings behind
 * the Action follow, each linked to the screen that shows it.
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
        <ul aria-label="Findings" className={ledgerClasses('-my-2')}>
          {action.members.map((member) => (
            <li key={member.id} className="min-w-0">
              <FindingRow member={member} onOpen={() => onOpen(member.id)} />
            </li>
          ))}
          {readings.map((record) => (
            <li key={record.key} className="min-w-0">
              <ReadingRow record={record} />
            </li>
          ))}
        </ul>
      ) : null}
    </ActionSection>
  );
}

function FindingRow({ member, onOpen }: Readonly<{ member: Member; onOpen: () => void }>) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onOpen}
      className={cn(
        ROW,
        'focus-ring hover:overlay-hover rounded-control -mx-2 flex w-[calc(100%+16px)] items-center gap-3 px-2 text-start',
      )}
    >
      <Stack gap="tight" className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className={textRole('body', 'min-w-0 truncate')}>{member.title}</span>
          <StatusMark variant="priority" value={severityPriority(member.severity)}>
            {severityLabel(member.severity)} impact
          </StatusMark>
          <Tag>Inferred</Tag>
        </span>
        <span className={textRole('caption', 'truncate tabular-nums')}>
          {SOURCE_LABEL[member.opportunity_type]} ·{' '}
          <DisplayTime value={member.updated_at} dateOnly fallback="date not recorded" />
        </span>
      </Stack>
      <Icon icon={ChevronRight} className="text-ink-2 shrink-0" />
    </button>
  );
}

/** A reading CiteLadder took (a crawl, a declared check), linked where it has a screen. */
function ReadingRow({ record }: Readonly<{ record: DatedEvidence }>) {
  return (
    <Stack gap="tight" className={cn(ROW, 'content-center')}>
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
  );
}
