import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Suspense, useEffect, useState, type ReactNode } from 'react';

import { FirstFrame } from '@/components/layout/first-frame';
import { UserMenuTrigger } from '@/components/layout/user-menu';
import { FlowBlock, FlowPage } from '@/components/templates/flow-page';
import { AuthActions } from '@/components/ui/auth-shell';
import { Button } from '@/components/ui/button';
import { refetchBilling } from '@/lib/api/billing';
import { capabilityRemaining } from '@/lib/billing/entitlement-capability';
import { useEntitlement } from '@/lib/billing/entitlement-context';
import { PROJECT_SLOTS_CAPABILITY } from '@/lib/config/billing';
import { WORKSPACE_LOADING_STALL_MS } from '@/lib/config/operational';
import { ownsWorkspace } from '@/lib/project/bootstrap';
import { workspaceDestination } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';

import { OnboardingScreen } from './onboarding-screen';
import { WorkspaceSetup } from './workspace-setup';
import { PLANS_HREF } from '@/lib/billing/plan-limit';

export function OnboardingPageClient() {
  return (
    <Suspense fallback={<FirstFrame />}>
      <ProjectSetupGate />
    </Suspense>
  );
}

function ProjectSetupGate() {
  const queryClient = useQueryClient();
  const { status, activeWorkspaceId, workspaces, retry: retryContext } = useProjectContext();
  const [searchParams] = useSearchParams();
  const { entitlement, isLoading: entitlementLoading } = useEntitlement();

  const retry = () => {
    retryContext();
    void refetchBilling(queryClient);
  };

  const remainingProjectSlots = capabilityRemaining(entitlement, PROJECT_SLOTS_CAPABILITY);
  const projectsHref = activeWorkspaceId
    ? workspaceDestination('/projects', null, activeWorkspaceId)
    : '/projects';

  // Every settled FAILURE is answered before the loading branch. A failed
  // workspace read leaves `activeWorkspaceId` null forever, so testing for it
  // first hid the retry behind a spinner that never resolved.
  if (status === 'error') {
    return (
      <ProjectSetupBlocked
        title="Your workspace could not be loaded"
        onRetry={retry}
        projectsHref={projectsHref}
      />
    );
  }
  if (setsUpOwnWorkspace(status, workspaces, searchParams.get('setup'))) return <WorkspaceSetup />;
  if (status === 'unavailable') {
    return <ProjectSetupBlocked title="That project is unavailable" projectsHref={projectsHref} />;
  }
  if (status === 'resolving' || activeWorkspaceId === null || entitlementLoading) {
    return <ProjectSetupLoading onRetry={retry} projectsHref={projectsHref} />;
  }
  if (remainingProjectSlots === undefined) {
    return (
      <ProjectSetupBlocked
        title="Project access unavailable"
        onRetry={retry}
        projectsHref={projectsHref}
      />
    );
  }
  if (remainingProjectSlots === 0) {
    return (
      <ProjectSetupBlocked title="Project limit reached" projectsHref={projectsHref} plans>
        Your plan does not include another project.
      </ProjectSetupBlocked>
    );
  }
  return <OnboardingScreen />;
}

function setsUpOwnWorkspace(
  status: string,
  workspaces: readonly { role: string }[],
  setup: string | null,
): boolean {
  if (status === 'no_workspace') return true;
  return setup === 'workspace' && !ownsWorkspace(workspaces);
}

function ProjectSetupLoading({
  onRetry,
  projectsHref,
}: Readonly<{ onRetry: () => void; projectsHref: string }>) {
  const [stalled, setStalled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => setStalled(true), WORKSPACE_LOADING_STALL_MS);
    return () => window.clearTimeout(timer);
  }, [attempt]);

  if (!stalled) return <FirstFrame />;
  return (
    <ProjectSetupBlocked
      title="Your workspace is taking longer to load"
      projectsHref={projectsHref}
      onRetry={() => {
        setStalled(false);
        setAttempt((current) => current + 1);
        onRetry();
      }}
    />
  );
}

function ProjectSetupBlocked({
  title,
  children,
  onRetry,
  projectsHref,
  plans = false,
}: Readonly<{
  title: string;
  children?: ReactNode;
  onRetry?: () => void;
  projectsHref: string;
  plans?: boolean;
}>) {
  return (
    <FlowPage label="Project setup" barEnd={<UserMenuTrigger presenter="compact" />}>
      <FlowBlock title={title} sub={children}>
        <AuthActions>
          {onRetry && (
            <Button variant="primary" onClick={onRetry}>
              Retry
            </Button>
          )}
          {plans ? (
            <Button asChild variant="primary">
              <Link to={PLANS_HREF}>See plans</Link>
            </Button>
          ) : null}
          <Button asChild variant="secondary">
            <Link to={projectsHref}>Back to projects</Link>
          </Button>
        </AuthActions>
      </FlowBlock>
    </FlowPage>
  );
}
