import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { EarnedPageHandoff } from '@/components/opportunities/earned-page-handoff';
import { OpportunityEvidenceSection } from '@/components/opportunities/opportunity-evidence-section';
import { OpportunitySummarySection } from '@/components/opportunities/opportunity-summary-section';
import { Drawer } from '@/components/ui/drawer';
import { Stack } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';
import { opportunitiesQueries } from '@/lib/api/opportunities';
import type { OpportunityDetail } from '@citeladder/contracts';
import { Limitations } from '@/components/ui/passage';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

/**
 * One Action member's evidence, backed by the persisted detail projection.
 * The row that opens it already shows the finding's impact, source and date,
 * so the drawer names the finding once in its header and shows only the rest:
 * the evidence, the recommended improvement and the handoff.
 */
export function EvidenceDrawer({
  opportunityId,
  title,
  targetUrl,
  projectId,
  open,
  onOpenChange,
}: Readonly<{
  opportunityId: string | null;
  /** The opening row's finding title, so the header names it before the detail loads. */
  title?: string;
  /** The Action's target, already shown on the page; evidence naming only it is not repeated. */
  targetUrl: string | null;
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
        {...readErrorProps(detailQuery)}
        fallback="Could not load this opportunity."
        title="Could not load this opportunity"
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
    body = <OpportunityDetailBody detail={detail} targetUrl={targetUrl} />;
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={detail?.title ?? title ?? 'Finding'}
      width="wide"
    >
      {body}
    </Drawer>
  );
}

/** Everything the drawer shows once a detail for THIS project has loaded. */
function OpportunityDetailBody({
  detail,
  targetUrl,
}: Readonly<{ detail: OpportunityDetail; targetUrl: string | null }>) {
  return (
    <Stack gap="workspace">
      <OpportunityEvidenceSection detail={detail} targetUrl={targetUrl} />
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
