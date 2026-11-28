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
import { Text } from '@/components/ui/typography';
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

const LEG_OWNER: Record<MeasurementLeg['leg'], { href: string; label: string } | null> = {
  next_visibility_run: { href: '/runs', label: 'Open Runs' },
  next_search_console_window: { href: '/performance', label: 'Open Performance' },
  next_crawl: null,
};

function Measurement({ declaration }: Readonly<{ declaration: ActionDeclaration }>) {
  if (declaration.resolved_before_snapshot_id)
    return (
      <Text as="p" variant="body" tone="ink-2">
        Resolved before go-live: not credited, not measured.
      </Text>
    );
  if (declaration.checks.length === 0)
    return (
      <Text as="p" variant="body" tone="ink-2">
        No automatic check applies. Recorded, not verified.
      </Text>
    );
  return (
    <>
      <Text as="p" variant="body" tone="ink-2" aria-live="polite">
        {IMPLEMENTATION_STATE_LABEL[declaration.state]}
      </Text>
      <Stack as="ul" gap="compact" aria-label="Checks">
        {declaration.checks.map((check) => (
          <CheckRow key={check.index} check={check} />
        ))}
      </Stack>
    </>
  );
}

export function DeclarationStatus({
  declaration,
  shownRevision,
  workspaceId,
  focusOnMount = false,
}: Readonly<{
  declaration: ActionDeclaration;
  shownRevision?: { id: string; number: number };
  workspaceId: string;
  focusOnMount?: boolean;
}>) {
  const heading = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focusOnMount) heading.current?.focus();
  }, [focusOnMount]);
  const hasVisibility = declaration.checks.some((check) => check.leg === 'next_visibility_run');
  const crawlOpen = declaration.checks.some(
    (check) => check.leg === 'next_crawl' && check.state !== 'met',
  );
  return (
    <Stack gap="compact">
      <Text as="p" variant="body" tone="ink-2">
        Went live on <DisplayTime value={declaration.declared_implemented_at} dateOnly />
        {revisionNote(declaration.output_revision_id, shownRevision)}
      </Text>
      <Deployment declaration={declaration} />
      <Text as="h3" variant="label" ref={heading} tabIndex={-1} focusable box="fit-content">
        Measurement
      </Text>
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
        <Text as="p" variant="caption">
          Read until <DisplayTime value={declaration.measured_until} dateOnly />. A met check does
          not prove this Action caused the movement.
        </Text>
      ) : null}
      <VerificationObservations implementation={declaration} showAuditLink={hasVisibility} />
    </Stack>
  );
}

const CHECK_TONE = { met: 'positive', unmet: 'negative', unavailable: 'warning' } as const;

function CheckRow({ check }: Readonly<{ check: ActionDeclaration['checks'][number] }>) {
  const tone = check.state === 'waiting' ? null : CHECK_TONE[check.state];
  const reason = checkReasonLabel(check.reason);
  const subject = checkSubject(check);
  const note = checkKindNote(check.kind);
  return (
    <Stack as="li" gap="tight">
      <Inline as="span" wrap>
        <Text variant="body">{checkKindLabel(check.kind)}</Text>
        {tone ? (
          <StatusMark tone={tone}>{checkStateLabel(check)}</StatusMark>
        ) : (
          <Tag>{checkStateLabel(check)}</Tag>
        )}
      </Inline>
      {subject ? <CheckSubject subject={subject} promptId={check.prompt_id} /> : null}
      {note ? <Text variant="caption">{note}</Text> : null}
      {reason || check.observed_at ? (
        <Text variant="caption">
          {reason}
          {reason && check.observed_at ? ' · ' : null}
          {check.observed_at ? (
            <>
              Read <DisplayTime value={check.observed_at} dateOnly />
            </>
          ) : null}
        </Text>
      ) : null}
    </Stack>
  );
}

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
  return <ClampText text="caption">{subject}</ClampText>;
}

function Deployment({ declaration }: Readonly<{ declaration: ActionDeclaration }>) {
  const { deployed_by: by, deployment_reference: reference } = declaration;
  return (
    <Text as="p" variant="caption" wrap="words">
      {by ? `Deployment recorded by ${by}` : 'Deployment recorded by a former workspace member'}
      {reference ? (
        <>
          {' · '}
          <TextLink variant="external" href={reference} text="inherit">
            {reference}
          </TextLink>
        </>
      ) : null}
    </Text>
  );
}

function revisionNote(
  declaredId: string | null,
  shown: { id: string; number: number } | undefined,
): string {
  if (!declaredId) return ' · done outside CiteLadder';
  if (!shown) return '';
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
      <Text variant="body">{measurementLegLabel(leg.leg)}</Text>
      <Text variant="caption">
        <LegWait leg={leg} />
        {waiting && owner ? (
          <>
            {' '}
            <TextLink href={owner.href} text="inherit">
              {owner.label}
            </TextLink>
          </>
        ) : null}
      </Text>
      {offerCrawl ? <RunCrawl workspaceId={workspaceId} /> : null}
    </Stack>
  );
}

function RunCrawl({ workspaceId }: Readonly<{ workspaceId: string }>) {
  const { activeProjectId } = useProjectContext();
  const mayWrite = useWorkspaceCapability('write');
  const start = useMutation(siteHealthMutations.createCrawl(workspaceId));
  if (!mayWrite || !activeProjectId) return null;
  if (start.isSuccess)
    return (
      <Text as="output" variant="caption">
        Crawl started.{' '}
        <TextLink href="/site" text="inherit">
          Open Site health
        </TextLink>
      </Text>
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
      <>Waiting for the next reading.</>
    );
  }
  return <>{NOT_SCHEDULED[leg.leg]}</>;
}

const NOT_SCHEDULED: Record<MeasurementLeg['leg'], string> = {
  next_visibility_run: 'No visibility run is scheduled.',
  next_search_console_window: 'Waiting for the next complete window.',
  next_crawl: 'Measured on your next crawl.',
};
