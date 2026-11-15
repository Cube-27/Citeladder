import { ClipboardList } from 'lucide-react';
import { useState } from 'react';

import { ActionSection } from '@/components/agent/action-section';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Dialog } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { Inline } from '@/components/ui/layout';
import { DisplayTime } from '@/components/ui/display-time';
import { textRole } from '@/components/ui/typography';
import { ledgerClasses, ledgerItemClasses } from '@/components/ui/workspace';
import { TextLink } from '@/components/ui/text-link';
import { Textarea } from '@/components/ui/textarea';
import { actionEvidence, type DatedEvidence } from '@/lib/agent/evidence';
import { developerTicket } from '@/lib/agent/handoff';
import type { ActionDetail } from '@/lib/api/actions';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayDate } from '@/lib/format';

const BASIS_LABEL: Record<DatedEvidence['basis'], string> = {
  observed: 'Observed',
  inferred: 'Inferred',
};

/**
 * The Action's records, one ruled row each: what it is (a link to the screen
 * that shows it), whether CiteLadder observed it or a rule inferred it, and
 * the date its persisted record carries.
 */
export function ActionEvidence({ action }: Readonly<{ action: ActionDetail }>) {
  const records = actionEvidence(action);
  if (records.length === 0) return null;
  return (
    <ActionSection title="Evidence" id="action-evidence">
      <ul aria-label="Evidence records" className={ledgerClasses()}>
        {records.map((item) => (
          <Inline
            as="li"
            gap="meta"
            key={item.key}
            className={ledgerItemClasses('items-baseline justify-between')}
          >
            {item.href ? (
              <TextLink href={item.href} text="body">
                {item.label}
              </TextLink>
            ) : (
              <span className={textRole('body')}>{item.label}</span>
            )}
            <span className={textRole('caption', 'tabular-nums')}>
              {BASIS_LABEL[item.basis]} ·{' '}
              <DisplayTime value={item.at} dateOnly fallback="date not recorded" />
            </span>
          </Inline>
        ))}
      </ul>
    </ActionSection>
  );
}

/**
 * "Prepare developer ticket": the Action as copyable Markdown for a developer
 * (the issue, the affected pages, the evidence, the minimal patch and how it
 * will be verified). Built from the Action's read; nothing is sent anywhere.
 */
export function DeveloperTicketButton({ action }: Readonly<{ action: ActionDetail }>) {
  const [open, setOpen] = useState(false);
  const timeZone = useDisplayTimeZone();
  const ticket = developerTicket(action, actionEvidence(action), (iso) =>
    formatDisplayDate(iso, timeZone),
  );
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Icon icon={ClipboardList} />
        Prepare developer ticket
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Developer ticket"
        description="Markdown for your issue tracker. Copy it and paste it into a new ticket."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Close
            </Button>
            <CopyButton value={ticket}>Copy Markdown</CopyButton>
          </>
        }
      >
        <Textarea aria-label="Developer ticket Markdown" readOnly rows={16} value={ticket} />
      </Dialog>
    </>
  );
}
