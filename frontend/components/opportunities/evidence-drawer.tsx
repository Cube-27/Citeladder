import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { EarnedPageHandoff } from '@/components/opportunities/earned-page-handoff';
import { OpportunityEvidenceSection } from '@/components/opportunities/opportunity-evidence-section';
import { OpportunitySummarySection } from '@/components/opportunities/opportunity-summary-section';
import { OpportunityTypeBadge } from '@/components/opportunities/opportunity-type-badge';
import { StatusMark } from '@/components/ui/status-mark';
import { Drawer } from '@/components/ui/drawer';
import { Inline, Stack } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';
import { opportunitiesQueries } from '@/lib/api/opportunities';
import type { OpportunityDetail } from '@citeladder/contracts';
import { severityLabel, severityPriority } from '@/lib/site-health/issues';
import { Limitations } from '@/components/ui/passage';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { Notice } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

/** One Action member's evidence, backed by the persisted detail projection. */
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
  const { workspaceId } = useProjectScope();
  const detailQuery = useQuery({
    ...opportunitiesQueries.detail(workspaceId, opportunityId ?? ''),
    enabled: open && opportunityId !== null,
  });
  const detail = detailQuery.data?.project_id === projectId ? detailQuery.data : null;

  let body: ReactNode;
  if (detailQuery.isError) {
    body = (
      <Notice
        kind="read"
        error={detailQuery.error}
        fallback="Could not load this opportunity."
        title="Could not load this opportunity"
        onRetry={() => void detailQuery.refetch()}
        pending={detailQuery.isFetching}
      />
    );
  } else if (detailQuery.data && !detail) {
    body = (
      <Notice tone="negative">
        This opportunity is unavailable in the selected project. Close this detail and choose a
        recommendation from the current project.
      </Notice>
    );
  } else if (detailQuery.isLoading || !detail) {
    body = <StateBlock kind="loading" />;
  } else {
    body = <OpportunityDetailBody detail={detail} />;
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Evidence detail" width="wide">
      {body}
    </Drawer>
  );
}

/** Everything the drawer shows once a detail for THIS project has loaded. */
function OpportunityDetailBody({ detail }: Readonly<{ detail: OpportunityDetail }>) {
  return (
    <Stack gap="workspace">
      <Stack>
        <h2 className={textRole('heading')}>{detail.title}</h2>
        <Inline className="flex-wrap">
          <StatusMark variant="priority" value={severityPriority(detail.severity)}>
            {severityLabel(detail.severity)} impact
          </StatusMark>
          <OpportunityTypeBadge type={detail.opportunity_type} />
        </Inline>
      </Stack>
      <OpportunityEvidenceSection detail={detail} />
      {detail.remediation ? (
        // The rule's own guidance, plain prose: neither measured evidence nor a model's draft.
        <Stack as="section">
          <h3 className={textRole('subheading')}>Recommended improvements</h3>
          <p className="type-body text-ink whitespace-pre-line">{detail.remediation}</p>
        </Stack>
      ) : null}
      <OpportunitySummarySection detail={detail} />
      <ActionHandoff detail={detail} />
    </Stack>
  );
}

/**
 * The route to the work.
 *
 * An earned action has a whole grounded brief behind it — the competitors on
 * the publisher's page, the passages proving it, the format, the coverage and
 * the named gap — and gets its own renderer. An owned action has a target, and
 * one sentence is the honest amount of chrome for it.
 */
function ActionHandoff({ detail }: Readonly<{ detail: OpportunityDetail }>) {
  if (detail.content_handoff.pathway === 'earned') {
    return <EarnedPageHandoff detail={detail} />;
  }
  return (
    <Stack as="section">
      <h3 className={textRole('subheading')}>Action handoff</h3>
      <p className={textRole('body')}>Create or improve content the brand controls.</p>
      <Limitations items={detail.content_handoff.limitations} />
    </Stack>
  );
}
