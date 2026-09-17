'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { MutationNotice } from '@/components/ui/mutation-notice';
import { panelClasses } from '@/components/ui/panel';
import { ReadError } from '@/components/ui/read-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Label, textRole } from '@/components/ui/typography';
import { ledgerClasses } from '@/components/ui/workspace';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { queryKeys } from '@/lib/api/query-keys';
import type { sourcePageDetailSchema } from '@/lib/api/schemas/source-pages';
import { sourcePagesMutations, sourcePagesQueries } from '@/lib/api/source-pages';
import {
  absenceBasis,
  pageFormatLabel,
  pageStateLabel,
  presenceLabel,
  type SourcePageEntity,
} from '@/lib/visibility/source-pages';
import { safeExternalUrl } from '@/lib/visibility/urls';

type PageDetail = z.infer<typeof sourcePageDetailSchema>;

/**
 * What this project knows about one externally cited page.
 *
 * Opening it reads a persisted projection and nothing else. Inspection is an
 * explicit command behind the button below, because a page view that quietly
 * fetched a publisher would spend budget nobody approved and send traffic to
 * a site we are trying to keep on side.
 */
export function SourcePageDrawer({
  projectId,
  workspaceId,
  urlHash,
  onClose,
}: Readonly<{
  projectId: string | null;
  workspaceId: string | null;
  urlHash: string | null;
  onClose: () => void;
}>) {
  const open = Boolean(urlHash && projectId && workspaceId);
  const query = useQuery({
    ...sourcePagesQueries.page(workspaceId ?? '', projectId ?? '', urlHash ?? ''),
    enabled: open,
  });
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Cited page"
      className="sm:max-w-160"
      footer={
        urlHash && projectId && workspaceId ? (
          <InspectCommand projectId={projectId} workspaceId={workspaceId} urlHash={urlHash} />
        ) : null
      }
    >
      {query.isError ? (
        <ReadError
          error={query.error}
          fallback="Could not load this page."
          onRetry={() => void query.refetch()}
          pending={query.isFetching}
        />
      ) : query.isLoading || !query.data ? (
        <div className="grid gap-3">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <PageBody detail={query.data} />
      )}
    </Drawer>
  );
}

function PageBody({ detail }: Readonly<{ detail: PageDetail }>) {
  const href = safeExternalUrl(detail.canonical_url);
  const format = pageFormatLabel(detail.page_format);
  const state = pageStateLabel(detail.inspection_state);
  return (
    <div className="grid gap-4">
      <div className="grid gap-2.5">
        <h2 className={textRole('objectTitle', 'leading-snug')}>
          {detail.title || detail.canonical_url}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="neutral">{detail.registrable_domain}</Badge>
          {format ? <Badge variant="neutral">{format}</Badge> : null}
          {state ? <Badge variant="neutral">{state}</Badge> : null}
        </div>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className={textRole('meta', 'hover:text-accent-text truncate hover:underline')}
          >
            {detail.canonical_url}
          </a>
        ) : null}
      </div>
      <Entities detail={detail} />
      {detail.limitations.length ? (
        <Alert tone="info">
          <span className="grid gap-1">
            {detail.limitations.map((limitation) => (
              <span key={limitation}>{limitation}</span>
            ))}
          </span>
        </Alert>
      ) : null}
    </div>
  );
}

/**
 * Every tracked name's verdict on this page, brand first.
 *
 * A positive finding carries its quoted window. An absence carries the
 * matching method and the extraction coverage instead — there is no passage
 * that can demonstrate one, and inventing a sentence that sounds like proof
 * is the failure this shape exists to prevent.
 */
function Entities({ detail }: Readonly<{ detail: PageDetail }>) {
  if (!detail.entities.length) {
    return (
      <section className="grid gap-2">
        <Label>Who appears on this page</Label>
        <p className={textRole('body')}>
          Nobody has read this page, so there are no findings about who appears on it.
        </p>
      </section>
    );
  }
  return (
    <section className="grid gap-2">
      <Label>Who appears on this page</Label>
      <ul className={ledgerClasses('boxed')}>
        {detail.entities.map((entity) => (
          <EntityRow
            key={`${entity.entity_kind}:${entity.entity_name}`}
            entity={entity}
            extractedChars={detail.extracted_chars}
          />
        ))}
      </ul>
    </section>
  );
}

function EntityRow({
  entity,
  extractedChars,
}: Readonly<{ entity: SourcePageEntity; extractedChars: number }>) {
  const verdict = presenceLabel(entity.state);
  const basis = absenceBasis(entity.state, entity.match_method, extractedChars);
  return (
    <li className="grid gap-1.5 px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Badge
          variant="classification"
          value={entity.entity_kind === 'brand' ? 'owned' : 'competitor'}
        >
          {entity.entity_name}
        </Badge>
        {verdict ? <span className={textRole('meta')}>{verdict}</span> : null}
      </div>
      {entity.passages.map((passage) => (
        <blockquote key={passage} className={panelClasses({ tone: 'well', pad: 'compact' })}>
          <p className={textRole('body', 'leading-relaxed')}>“{passage}”</p>
        </blockquote>
      ))}
      {basis ? <p className="text-muted text-xs">{basis}</p> : null}
      {entity.limitations.map((limitation) => (
        <p key={limitation} className="text-muted text-xs">
          {limitation}
        </p>
      ))}
    </li>
  );
}

/**
 * Ask for this page to be inspected ahead of the automatic selection.
 *
 * It spends the same budget as automatic selection, so the answer states what
 * happened — admitted, or declined and why — rather than reporting success and
 * leaving the reader to wonder why nothing changed.
 */
function InspectCommand({
  projectId,
  workspaceId,
  urlHash,
}: Readonly<{ projectId: string; workspaceId: string; urlHash: string }>) {
  const queryClient = useQueryClient();
  const inspect = useMutation({
    ...sourcePagesMutations.inspect(workspaceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sourcePages.all }),
  });
  const result = inspect.data;
  return (
    <div className="grid gap-2">
      {inspect.isError ? (
        <MutationNotice
          notice={mutationNoticeForError(inspect.error, { action: 'request this inspection' })}
          onRetry={() => inspect.mutate({ projectId, urlHash })}
        />
      ) : null}
      {result ? <p className="text-muted text-xs">{inspectionOutcome(result)}</p> : null}
      <Button
        size="sm"
        variant="secondary"
        className="justify-self-start"
        disabled={inspect.isPending}
        onClick={() => inspect.mutate({ projectId, urlHash })}
      >
        Inspect this page
      </Button>
    </div>
  );
}

const DECLINE_REASONS: Record<string, string> = {
  budget_exhausted: "This project's inspection budget for today is spent.",
  no_completed_audit: 'Inspection runs against a completed run, and this project has none yet.',
};

function inspectionOutcome(result: {
  accepted: boolean;
  reason: string | null;
  budget_remaining: number;
}): string {
  if (result.accepted) {
    return `Queued. ${result.budget_remaining} inspections left in this project's window.`;
  }
  return (
    (result.reason ? DECLINE_REASONS[result.reason] : null) ??
    'This inspection was not accepted. The request is remembered either way.'
  );
}
