'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';

import { OpportunityEvidenceSection } from '@/components/opportunities/opportunity-evidence-section';
import { OpportunityStatusBadge } from '@/components/opportunities/opportunity-status-badge';
import { OpportunityStatusFooter } from '@/components/opportunities/opportunity-status-footer';
import { OpportunitySummarySection } from '@/components/opportunities/opportunity-summary-section';
import { OpportunityTypeBadge } from '@/components/opportunities/opportunity-type-badge';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/typography';
import { opportunitiesQueries } from '@/lib/api/opportunities';
import { severityBadgeValue, severityLabel } from '@/lib/site-health/issues';

/** Recommendation detail drawer backed by the persisted detail projection. */
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
        <DialogPrimitive.Overlay className="bg-overlay-scrim z-overlay fixed inset-0" />
        <DialogPrimitive.Content className="border-border-subtle bg-elevated shadow-modal-value z-modal fixed top-0 right-0 flex h-full w-112 max-w-full flex-col border-l focus:outline-none">
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
                <OpportunityEvidenceSection detail={detail} />
                <OpportunitySummarySection detail={detail} />
              </div>
            )}
          </div>
          {detail ? <OpportunityStatusFooter detail={detail} projectId={projectId} /> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
