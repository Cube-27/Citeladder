'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/typography';
import { OPPORTUNITY_STATUS_META } from '@/components/opportunities/opportunity-status-meta';
import { useUpdateOpportunityStatus } from '@/components/opportunities/use-opportunity-status';
import { opportunitiesQueries } from '@/lib/api/opportunities';
import type { OpportunityDetail, OpportunityStatus, OpportunityType } from '@/lib/api/types';
import { severityBadgeValue, severityLabel } from '@/lib/site-health/issues';
import { formatAudited } from '@/lib/site-health/status';
import { cn } from '@/lib/utils';

/**
 * Recommendation detail drawer (drilldown side drawer).
 *
 * Right-side Radix DialogPrimitive shell (bg-elevated, hairline left border,
 * shadow-modal, scrim — 448px). Body sections, all rendered from the
 * persisted detail projection:
 *   1. Title + badges (severity, area, status)
 *   2. What to do (actionable remediation)
 *   3. Why (evidence: context the user can understand)
 *   4. Summary footer (detected date + status workflow)
 *
 * Internal provenance (rule_id, versions, source row ids) is not rendered —
 * it is available in the API export for debugging.
 */

const TYPE_LABEL: Record<OpportunityType, string> = {
  visibility: 'Visibility',
  site: 'Site',
  traffic: 'Traffic',
  topic: 'Topic',
};

/** Status badge driven by OPPORTUNITY_STATUS_META. */
export function OpportunityStatusBadge({ status }: Readonly<{ status: OpportunityStatus }>) {
  const meta = OPPORTUNITY_STATUS_META[status];
  if (meta.badge === 'neutral') {
    return <Badge>{meta.label}</Badge>;
  }
  return (
    <Badge variant="status" value={meta.badge}>
      {meta.label}
    </Badge>
  );
}

/** Type badge (mockup palette: visibility=accent, site=info, topic/traffic=third-party). */
export function OpportunityTypeBadge({ type }: Readonly<{ type: OpportunityType }>) {
  return (
    <Badge
      className={cn(
        type === 'visibility' && 'text-accent-text',
        type === 'site' && 'text-info-text',
        (type === 'topic' || type === 'traffic') && 'text-citation-third-party-text',
      )}
    >
      {TYPE_LABEL[type]}
    </Badge>
  );
}

/** One labeled row. */
function KvRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-2xs text-muted shrink-0">{label}</span>
      <span className="text-secondary text-right text-sm break-words">{value}</span>
    </div>
  );
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Evidence section — context the user can understand: quote, URL, competitors. */
function EvidenceSection({ detail }: Readonly<{ detail: OpportunityDetail }>) {
  const evidence = detail.evidence;
  const promptText = asString(evidence.prompt_text);
  const url = asString(evidence.url) ?? detail.target_url;
  const theme = asString(evidence.prompt_theme) ?? detail.target_theme;
  const competitors = asStringList(evidence.competitor_names);

  return (
    <section className="grid gap-2">
      <Label>Evidence</Label>
      {promptText ? (
        <blockquote className="border-accent-border bg-accent-subtle rounded-lg border-l-2 px-3 py-2">
          <p className="text-foreground text-sm">“{promptText}”</p>
        </blockquote>
      ) : null}
      {url ? (
        <p className="mono text-accent-text bg-background-alt rounded-lg px-3 py-2 text-xs break-all">
          {url}
        </p>
      ) : null}
      {theme ? <KvRow label="Topic" value={theme} /> : null}
      {competitors.length > 0 ? (
        <div className="grid gap-1">
          <span className="text-2xs text-muted">Competitors mentioned</span>
          <div className="flex flex-wrap gap-1.5">
            {competitors.map((name) => (
              <Badge key={name} variant="classification" value="competitor">
                {name}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Summary section — user-facing "where this came from" without internals. */
function SummarySection({ detail }: Readonly<{ detail: OpportunityDetail }>) {
  return (
    <section className="grid gap-2">
      <Label>Source</Label>
      <div className="divide-border-subtle divide-y">
        <KvRow label="Detected" value={formatAudited(detail.created_at)} />
      </div>
    </section>
  );
}

/** Status-workflow footer — the ONLY mutation the surface allows. */
function StatusFooter({
  detail,
  projectId,
}: Readonly<{ detail: OpportunityDetail; projectId: string }>) {
  const updateStatus = useUpdateOpportunityStatus(projectId, detail.id);

  const change = (status: OpportunityStatus) => {
    updateStatus.mutate({ opportunityId: detail.id, status });
  };

  return (
    <footer className="border-border-subtle grid gap-2 border-t px-4 py-3">
      {updateStatus.isError ? (
        <Alert tone="danger">
          Could not update the status — the opportunity may have been superseded by a newer
          recompute.
        </Alert>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xs text-muted">Status</span>
          <OpportunityStatusBadge status={detail.status} />
        </div>
        <div className="flex items-center gap-2">
          {detail.status === 'open' ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={updateStatus.isPending}
                onClick={() => change('dismissed')}
              >
                Dismiss
              </Button>
              <Button
                size="sm"
                disabled={updateStatus.isPending}
                onClick={() => change('in_progress')}
              >
                Mark in progress
              </Button>
            </>
          ) : null}
          {detail.status === 'in_progress' ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={updateStatus.isPending}
                onClick={() => change('dismissed')}
              >
                Dismiss
              </Button>
              <Button
                size="sm"
                disabled={updateStatus.isPending}
                onClick={() => change('resolved')}
              >
                Mark resolved
              </Button>
            </>
          ) : null}
          {detail.status === 'dismissed' || detail.status === 'resolved' ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={updateStatus.isPending}
              onClick={() => change('open')}
            >
              Reopen
            </Button>
          ) : null}
        </div>
      </div>
    </footer>
  );
}

export function EvidenceDrawer({
  opportunityId,
  projectId,
  open,
  onOpenChange,
}: Readonly<{
  opportunityId: string | null;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const detailQuery = useQuery({
    ...opportunitiesQueries.detail(opportunityId ?? ''),
    enabled: open && opportunityId !== null,
  });
  const detail = detailQuery.data ?? null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="bg-overlay-scrim fixed inset-0 z-[100]" />
        <DialogPrimitive.Content className="border-border-subtle bg-elevated shadow-modal-value fixed top-0 right-0 z-[101] flex h-full w-[448px] max-w-full flex-col border-l focus:outline-none">
          <header className="border-border-subtle flex items-center justify-between gap-2 border-b px-4 py-3">
            <DialogPrimitive.Title className="text-foreground text-heading-sm truncate">
              Opportunity detail
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close drawer">
                <X className="size-4" aria-hidden />
              </Button>
            </DialogPrimitive.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
            {detailQuery.isError ? (
              <Alert tone="danger">Could not load this opportunity. Please try again.</Alert>
            ) : detailQuery.isLoading || !detail ? (
              <div className="grid gap-3">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : (
              <div className="grid gap-5">
                <div className="grid gap-2">
                  <h2 className="text-foreground text-lg">{detail.title}</h2>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="status" value={severityBadgeValue(detail.severity)}>
                      {severityLabel(detail.severity)} impact
                    </Badge>
                    <OpportunityTypeBadge type={detail.opportunity_type} />
                    <OpportunityStatusBadge status={detail.status} />
                  </div>
                </div>
                {detail.remediation ? (
                  <section className="grid gap-2">
                    <Label>What to do</Label>
                    <div className="border-border-subtle bg-background-alt rounded-lg border p-3">
                      <p className="text-foreground text-sm whitespace-pre-line">
                        {detail.remediation}
                      </p>
                    </div>
                  </section>
                ) : null}
                <EvidenceSection detail={detail} />
                <SummarySection detail={detail} />
              </div>
            )}
          </div>
          {detail ? <StatusFooter detail={detail} projectId={projectId} /> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
