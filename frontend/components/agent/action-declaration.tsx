'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

import { ProjectLink } from '@/components/layout/scoped-link';
import { VerificationObservations } from '@/components/opportunities/verification-observations';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { DisplayTime } from '@/components/ui/display-time';
import { MutationNotice } from '@/components/ui/mutation-notice';
import { ReadError } from '@/components/ui/read-error';
import { textRole } from '@/components/ui/typography';
import { newIdempotencyKey } from '@/lib/agent/idempotency';
import { measurementLegLabel } from '@/lib/agent/vocabulary';
import {
  actionsMutations,
  actionsQueries,
  type ActionDeclaration,
  type MeasurementLeg,
} from '@/lib/api/actions';
import type { AgentOutput } from '@/lib/api/agent';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { queryKeys } from '@/lib/api/query-keys';
import { useWorkspaceCapability } from '@/lib/project/project-context';

/**
 * Where a user starts the reading a leg is waiting for; nothing runs by
 * itself. The placement recheck is due-dated by its own check, so it has none.
 */
const LEG_OWNER: Record<MeasurementLeg['leg'], { href: string; label: string } | null> = {
  next_visibility_run: { href: '/runs', label: 'Open Runs' },
  next_search_console_window: { href: '/performance', label: 'Open Performance' },
  next_crawl: { href: '/site', label: 'Open Site Health' },
  placement_recheck: null,
};

/**
 * "Mark implemented": the user's explicit declaration (plan §9). The server
 * freezes the targets and expected checks; the user names only the revision
 * they shipped, or none for work done outside CiteLadder.
 */
export function MarkImplementedButton({
  workspaceId,
  actionId,
  revision,
  disabled = false,
}: Readonly<{
  workspaceId: string;
  actionId: string;
  /** The output revision shipped; null declares work done outside CiteLadder. */
  revision: { id: string; number: number } | null;
  disabled?: boolean;
}>) {
  const [open, setOpen] = useState(false);
  // One key per dialog opening, so a retry after an ambiguous failure replays
  // the same declaration instead of attempting a second one.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const queryClient = useQueryClient();
  const declare = useMutation({
    ...actionsMutations.declare(workspaceId),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.actions.all });
    },
  });
  const submit = () =>
    declare.mutate({
      actionId,
      idempotencyKey,
      input: {
        output_revision_id: revision?.id ?? null,
        declared_implemented_at: new Date().toISOString(),
      },
    });
  return (
    <>
      <Button
        disabled={disabled}
        onClick={() => {
          declare.reset();
          setIdempotencyKey(newIdempotencyKey());
          setOpen(true);
        }}
      >
        <CheckCircle2 className="size-3.5" aria-hidden />
        Mark implemented
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Mark implemented"
        description={
          revision
            ? `Declare that revision ${revision.number} of this output is live on your site.`
            : 'Declare that this work is live, done outside CiteLadder.'
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button pending={declare.isPending} pendingLabel="Declaring…" onClick={submit}>
              Declare implemented
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <p className={textRole('body')}>
            CiteLadder then measures this Action with the evidence each of its findings needs: the
            next visibility run, Search Console window, crawl or placement recheck. Nothing runs
            automatically, and an Action can be declared once.
          </p>
          {declare.isError ? (
            <MutationNotice
              notice={mutationNoticeForError(declare.error, {
                action: 'declare this Action implemented',
              })}
              onRetry={submit}
            />
          ) : null}
        </div>
      </Dialog>
    </>
  );
}

/**
 * The output pane's implementation state. Declaring anchors the Action to the
 * revision on screen; an outline is approved and drafted first, and an output
 * with no target has no Action to declare.
 */
export function OutputDeclaration({
  workspaceId,
  output,
  runActive,
}: Readonly<{ workspaceId: string; output: AgentOutput; runActive: boolean }>) {
  const mayWrite = useWorkspaceCapability('write');
  const actionId = output.action_id;
  const revision = output.latest_revision;
  const action = useQuery({
    ...actionsQueries.detail(workspaceId, actionId ?? ''),
    enabled: Boolean(actionId) && output.phase !== 'outline',
  });
  if (output.phase === 'outline' || !revision) return null;
  if (!actionId)
    return (
      <p className={textRole('meta')}>
        Name the page or topic this output is for to declare it implemented.
      </p>
    );
  if (action.isError)
    return (
      <ReadError
        error={action.error}
        fallback="The Action's implementation state could not be loaded."
        onRetry={() => void action.refetch()}
        pending={action.isFetching}
      />
    );
  if (!action.data) return null;
  const declaration = action.data.declaration;
  if (declaration) {
    const number = declaration.output_revision_id === revision.id ? revision.number : null;
    return <DeclarationStatus declaration={declaration} revisionNumber={number} />;
  }
  const declarable = action.data.status === 'open' || action.data.status === 'in_progress';
  if (!declarable || !mayWrite) return null;
  return (
    <div>
      <MarkImplementedButton
        workspaceId={workspaceId}
        actionId={actionId}
        revision={{ id: revision.id, number: revision.number }}
        disabled={runActive}
      />
    </div>
  );
}

/** A declared Action: when, which revision, and what each loop leg awaits. */
export function DeclarationStatus({
  declaration,
  revisionNumber,
}: Readonly<{ declaration: ActionDeclaration; revisionNumber?: number | null }>) {
  return (
    <div className="grid gap-3">
      <p className={textRole('body')}>
        Declared implemented on <DisplayTime value={declaration.declared_implemented_at} dateOnly />
        {revisionNumber ? ` · revision ${revisionNumber}` : null}
        {declaration.output_revision_id ? null : ' · done outside CiteLadder'}
      </p>
      {declaration.legs.length > 0 ? (
        <ul className="grid gap-2" aria-label="Measurement">
          {declaration.legs.map((leg) => (
            <LegRow key={leg.leg} leg={leg} />
          ))}
        </ul>
      ) : (
        <p className={textRole('meta')}>
          No current finding targets this Action, so there is nothing to measure automatically.
        </p>
      )}
      <VerificationObservations implementation={declaration} />
    </div>
  );
}

function LegRow({ leg }: Readonly<{ leg: MeasurementLeg }>) {
  const owner = LEG_OWNER[leg.leg];
  return (
    <li className="grid gap-0.5">
      <span className={textRole('bodyStrong')}>{measurementLegLabel(leg.leg)}</span>
      <span className={textRole('meta')}>
        <LegWait leg={leg} />
        {leg.state === 'observed' || !owner ? null : (
          <>
            {' '}
            <ProjectLink href={owner.href} className="underline underline-offset-2">
              {owner.label}
            </ProjectLink>
          </>
        )}
      </span>
    </li>
  );
}

function LegWait({ leg }: Readonly<{ leg: MeasurementLeg }>) {
  if (leg.state === 'observed') {
    return leg.last_evidence_at ? (
      <>
        Observed · <DisplayTime value={leg.last_evidence_at} dateOnly />
      </>
    ) : (
      <>Observed</>
    );
  }
  if (leg.state === 'sync_needed')
    return <>The window has closed. Sync Search Console to measure it.</>;
  if (leg.state === 'waiting' && leg.due_at) {
    return (
      <>
        Waiting · expected <DisplayTime value={leg.due_at} dateOnly />.
      </>
    );
  }
  return <>{NOT_SCHEDULED[leg.leg]}</>;
}

const NOT_SCHEDULED: Record<MeasurementLeg['leg'], string> = {
  next_visibility_run: 'No visibility run is scheduled. Run or schedule one to measure.',
  next_search_console_window: 'Waiting for the next complete window.',
  next_crawl: 'Crawls run when you start one. Run a Site Health crawl to measure.',
  placement_recheck: 'No recheck of the publisher page is scheduled.',
};
