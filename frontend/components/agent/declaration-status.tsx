import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { VerificationObservations } from '@/components/opportunities/verification-observations';
import { StatusMark } from '@/components/ui/status-mark';
import { Tag } from '@/components/ui/tag';
import { Button } from '@/components/ui/button';
import { ClampText } from '@/components/ui/clamp-text';
import { DisplayTime } from '@/components/ui/display-time';
import { Inline, Stack } from '@/components/ui/layout';
import { TextLink } from '@/components/ui/text-link';
import { textRole, type TextRole } from '@/components/ui/typography';
import {
  checkKindLabel,
  checkKindNote,
  checkReasonLabel,
  checkStateLabel,
  checkSubject,
  IMPLEMENTATION_STATE_LABEL,
  measurementLegLabel,
} from '@/lib/agent/vocabulary';
import type { ActionDeclaration, MeasurementLeg } from '@/lib/api/actions';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { siteHealthMutations } from '@/lib/api/site-health-queries';
import { promptHistoryHref } from '@/lib/prompts/history';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';
import { Notice } from '@/components/ui/notice';

/**
 * Where a user starts the reading a leg is waiting for; nothing runs by
 * itself. A crawl can start from here.
 */
const LEG_OWNER: Record<MeasurementLeg['leg'], { href: string; label: string } | null> = {
  next_visibility_run: { href: '/runs', label: 'Open Runs' },
  next_search_console_window: { href: '/performance', label: 'Open Performance' },
  // A crawl starts from here: Run crawl now.
  next_crawl: null,
};

/**
 * What the declaration measures. Findings a refresh resolved before go-live
 * are not credited to the change, which is distinct from findings no check
 * applies to.
 */
function Measurement({ declaration }: Readonly<{ declaration: ActionDeclaration }>) {
  if (declaration.resolved_before_snapshot_id)
    return (
      <p className={textRole('body', 'text-ink-2')}>
        These findings were already resolved before this went live, so the outcome is not credited
        to this change and nothing is measured.
      </p>
    );
  if (declaration.checks.length === 0)
    return (
      <p className={textRole('body', 'text-ink-2')}>
        No automatic check applies to these findings, so CiteLadder records the work but cannot
        verify it.
      </p>
    );
  return (
    <>
      <p className={textRole('body', 'text-ink-2')} aria-live="polite">
        {IMPLEMENTATION_STATE_LABEL[declaration.state]}
      </p>
      <Stack as="ul" gap="compact" aria-label="Checks">
        {declaration.checks.map((check) => (
          <CheckRow key={check.index} check={check} />
        ))}
      </Stack>
    </>
  );
}

/**
 * A declared Action: when it went live, each check's latest reading, what the
 * next readings wait for, and what the readings can and cannot show.
 */
export function DeclarationStatus({
  declaration,
  shownRevision,
  workspaceId,
  focusOnMount = false,
  titleRole = 'subheading',
}: Readonly<{
  declaration: ActionDeclaration;
  /** The revision on screen, when shown beside an output. */
  shownRevision?: { id: string; number: number };
  workspaceId: string;
  /** Move focus here: the dialog that declared it just closed with its trigger gone. */
  focusOnMount?: boolean;
  /** The Measurement title's role: a reading page passes its section-title role. */
  titleRole?: TextRole;
}>) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) heading.current?.focus();
  }, [focusOnMount]);
  const hasVisibility = declaration.checks.some((check) => check.leg === 'next_visibility_run');
  // A crawl is worth starting while any page check still lacks a met reading.
  const crawlOpen = declaration.checks.some(
    (check) => check.leg === 'next_crawl' && check.state !== 'met',
  );
  return (
    <Stack gap="compact">
      <p className={textRole('body', 'text-ink-2')}>
        Went live on <DisplayTime value={declaration.declared_implemented_at} dateOnly />
        {revisionNote(declaration.output_revision_id, shownRevision)}
      </p>
      <Deployment declaration={declaration} />
      <h3 ref={heading} tabIndex={-1} className={textRole(titleRole, 'focus-ring w-fit')}>
        Measurement
      </h3>
      <Measurement declaration={declaration} />
      {declaration.legs.length > 0 ? (
        <Stack as="ul" gap="compact" aria-label="Next readings">
          {declaration.legs.map((leg) => (
            <LegRow
              key={leg.leg}
              leg={leg}
              workspaceId={workspaceId}
              offerCrawl={leg.leg === 'next_crawl' && crawlOpen}
            />
          ))}
        </Stack>
      ) : null}
      {declaration.checks.length > 0 ? (
        <p className={textRole('caption')}>
          New evidence is read until <DisplayTime value={declaration.measured_until} dateOnly />. A
          met check shows the change is live and measured; it does not prove this Action caused any
          movement, and other changes can overlap.
        </p>
      ) : null}
      <VerificationObservations implementation={declaration} showAuditLink={hasVisibility} />
    </Stack>
  );
}

const CHECK_TONE = { met: 'success', unmet: 'danger', unavailable: 'warning' } as const;

function CheckRow({ check }: Readonly<{ check: ActionDeclaration['checks'][number] }>) {
  const tone = check.state === 'waiting' ? null : CHECK_TONE[check.state];
  const reason = checkReasonLabel(check.reason);
  const subject = checkSubject(check);
  const note = checkKindNote(check.kind);
  return (
    <Stack as="li" gap="tight">
      <Inline as="span" className="flex-wrap">
        <span className={textRole('body')}>{checkKindLabel(check.kind)}</span>
        {tone ? (
          <StatusMark variant="status" value={tone}>
            {checkStateLabel(check)}
          </StatusMark>
        ) : (
          <Tag>{checkStateLabel(check)}</Tag>
        )}
      </Inline>
      {subject ? <CheckSubject subject={subject} promptId={check.prompt_id} /> : null}
      {note ? <span className={textRole('caption')}>{note}</span> : null}
      {reason || check.observed_at ? (
        <span className={textRole('caption')}>
          {reason}
          {reason && check.observed_at ? ' · ' : null}
          {check.observed_at ? (
            <>
              Read <DisplayTime value={check.observed_at} dateOnly />
            </>
          ) : null}
        </span>
      ) : null}
    </Stack>
  );
}

/** What a check names; a prompt opens its history. */
function CheckSubject({
  subject,
  promptId,
}: Readonly<{ subject: string; promptId?: string | null }>) {
  if (promptId)
    return (
      <TextLink href={promptHistoryHref(promptId)} text="caption">
        {subject}
      </TextLink>
    );
  return <ClampText className={textRole('caption')}>{subject}</ClampText>;
}

/**
 * The recorded deployment step: who recorded the go-live and what shipped it.
 * A reference that is a web address opens in a new tab; any other stays text.
 */
function Deployment({ declaration }: Readonly<{ declaration: ActionDeclaration }>) {
  const { deployed_by: by, deployment_reference: reference } = declaration;
  return (
    <p className={textRole('caption', 'break-words')}>
      {by ? `Deployment recorded by ${by}` : 'Deployment recorded by a former workspace member'}
      {reference ? (
        <>
          {' · '}
          <TextLink variant="external" href={reference} text="inherit">
            {reference}
          </TextLink>
        </>
      ) : null}
    </p>
  );
}

function revisionNote(
  declaredId: string | null,
  shown: { id: string; number: number } | undefined,
): string {
  if (!declaredId) return ' · done outside CiteLadder';
  if (!shown) return '';
  // Later edits are not what was shipped; say so rather than imply they were.
  return declaredId === shown.id
    ? ` · revision ${shown.number}`
    : ' · an earlier revision; this one was not declared';
}

function LegRow({
  leg,
  workspaceId,
  offerCrawl,
}: Readonly<{ leg: MeasurementLeg; workspaceId: string; offerCrawl: boolean }>) {
  const owner = LEG_OWNER[leg.leg];
  const waiting = leg.state !== 'observed';
  return (
    <Stack as="li" gap="tight">
      <span className={textRole('body')}>{measurementLegLabel(leg.leg)}</span>
      <span className={textRole('caption')}>
        <LegWait leg={leg} />
        {waiting && owner ? (
          <>
            {' '}
            <TextLink href={owner.href} text="inherit">
              {owner.label}
            </TextLink>
          </>
        ) : null}
      </span>
      {offerCrawl ? <RunCrawl workspaceId={workspaceId} /> : null}
    </Stack>
  );
}

/** Start the crawl a page check waits for, without leaving the Action. */
function RunCrawl({ workspaceId }: Readonly<{ workspaceId: string }>) {
  const { activeProjectId } = useProjectContext();
  const mayWrite = useWorkspaceCapability('write');
  const start = useMutation(siteHealthMutations.createCrawl(workspaceId));
  if (!mayWrite || !activeProjectId) return null;
  if (start.isSuccess)
    return (
      <output className={textRole('caption')}>
        Crawl started. The checks update when it finishes.{' '}
        <TextLink href="/site" text="inherit">
          Open Site health
        </TextLink>
      </output>
    );
  return (
    <Stack gap="compact">
      <div>
        <Button
          variant="secondary"
          pending={start.isPending}
          pendingLabel="Starting…"
          onClick={() => start.mutate({ project_id: activeProjectId })}
        >
          Run crawl now
        </Button>
      </div>
      {start.isError ? (
        <Notice
          kind="mutation"
          notice={mutationNoticeForError(start.error, { action: 'start a crawl' })}
          onRetry={() => start.mutate({ project_id: activeProjectId })}
        />
      ) : null}
    </Stack>
  );
}

function LegWait({ leg }: Readonly<{ leg: MeasurementLeg }>) {
  if (leg.state === 'observed') {
    return leg.last_evidence_at ? (
      <>
        Read · <DisplayTime value={leg.last_evidence_at} dateOnly />
      </>
    ) : (
      <>Read</>
    );
  }
  if (leg.state === 'sync_needed')
    return <>The window has closed. Sync Search Console to measure it.</>;
  if (leg.state === 'waiting') {
    return leg.due_at ? (
      <>
        Waiting · expected <DisplayTime value={leg.due_at} dateOnly />.
      </>
    ) : (
      <>Waiting for the next reading; its date is not known.</>
    );
  }
  return <>{NOT_SCHEDULED[leg.leg]}</>;
}

const NOT_SCHEDULED: Record<MeasurementLeg['leg'], string> = {
  next_visibility_run: 'No visibility run is scheduled. Run or schedule one to measure.',
  next_search_console_window: 'Waiting for the next complete window.',
  next_crawl: 'Crawls run when you start one.',
};
