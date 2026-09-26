'use client';

import { Link, useLocation } from 'react-router-dom';

import { FlowActions, FlowShell, type FlowStep } from '@/components/auth/flow-shell';
import { ThemeSwitch } from '@/components/layout/theme-switch';
import { UserMenuTrigger } from '@/components/layout/user-menu';
import { Button } from '@/components/ui/button';
import { projectDestination } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';

import { hasConfirmedIcp } from './icp-confirmation';
import { useOnboardingFlow } from './onboarding-flow';
import { BrandStage, CreationStage, DiscoveryStage, ReviewStage } from './onboarding-stages';

const STEPS: readonly FlowStep[] = [
  { id: 'brand', label: 'Basics' },
  { id: 'discovery', label: 'Research' },
  { id: 'review', label: 'Confirm' },
];

/** The onboarding transaction coordinator; each visual stage owns its own UI. */
export function OnboardingScreen() {
  const location = useLocation();
  // Cached routes may retain component state. A fresh Add project URL must
  // start a fresh transaction, and a hidden route must not keep redirecting.
  if (stripTrailingSlashes(location.pathname) !== '/onboarding') return null;
  // Draft replacements retain this entry's transaction. An explicit navigation
  // gets a new key, even when it opens another draft without leaving this route.
  const transactionKey: string = location.state?.onboardingTransactionKey ?? location.key;
  return <OnboardingTransaction key={transactionKey} transactionKey={transactionKey} />;
}

function OnboardingTransaction({ transactionKey }: Readonly<{ transactionKey: string }>) {
  const flow = useOnboardingFlow(transactionKey);
  const { activeProjectId } = useProjectContext();
  /**
   * Where leaving setup would land — or nothing, when leaving has nowhere to go.
   *
   * `?new=1` says the reader ASKED for another project, not that they have one.
   * "Add project" on the empty state sets it too, so a workspace with no
   * projects was offered a way out to `/projects`, which is precisely the
   * address that sends an empty workspace back into setup. The reader saw a
   * flicker and landed back in the flow they were trying to leave.
   *
   * A resolved project is the honest test: it is both the thing to return to
   * and the proof that returning goes somewhere.
   */
  const projectsHref = activeProjectId
    ? projectDestination('/projects', null, activeProjectId)
    : undefined;
  const stage = onboardingStage(flow);
  const measure = !flow.isCompleting && flow.step === 2 ? 'wide' : 'default';

  return (
    <FlowShell
      mainLabel="Project setup"
      steps={STEPS}
      currentStep={flow.step}
      // No exit unless there is somewhere to exit to. Setup used to leave for
      // the marketing site instead, which dropped a signed-in reader out of
      // the product entirely; the account menu beside this is the way out when
      // there is no project to go back to.
      exitHref={flow.isAdditional ? projectsHref : undefined}
      trailing={
        <div className="flex items-center gap-1">
          <ThemeSwitch />
          <UserMenuTrigger presenter="compact" />
        </div>
      }
      align={flow.isCompleting ? 'center' : 'start'}
      measure={measure}
      actions={
        flow.isCompleting ? undefined : (
          <OnboardingActions flow={flow} projectsHref={projectsHref} />
        )
      }
    >
      {stage}
    </FlowShell>
  );
}

function stripTrailingSlashes(pathname: string): string {
  let end = pathname.length;
  while (end > 1 && pathname[end - 1] === '/') end -= 1;
  return pathname.slice(0, end);
}

function onboardingStage(flow: ReturnType<typeof useOnboardingFlow>) {
  if (flow.isCompleting) {
    return <CreationStage committedProjectId={flow.completedProjectId} />;
  }
  if (flow.step === 0) {
    return (
      <BrandStage form={flow.form} isAdditional={flow.isAdditional} onSubmit={flow.submitBrand} />
    );
  }
  if (flow.step === 1) {
    return (
      <DiscoveryStage
        brandName={flow.brand?.brand_name}
        discovery={flow.discovery}
        onEdit={() => flow.setStep(0)}
      />
    );
  }
  return <ReviewStage flow={flow} />;
}

function OnboardingActions({
  flow,
  projectsHref,
}: Readonly<{ flow: ReturnType<typeof useOnboardingFlow>; projectsHref: string | undefined }>) {
  if (flow.step === 0) {
    return (
      <FlowActions
        secondary={
          // Same rule as the exit above: cancelling has to lead somewhere.
          flow.isAdditional && projectsHref ? (
            <Button asChild variant="ghost" size="md">
              <Link to={projectsHref}>Cancel</Link>
            </Button>
          ) : undefined
        }
        primary={
          <Button type="submit" form="onboarding-brand-form" size="md">
            Continue
          </Button>
        }
      />
    );
  }

  if (flow.step === 1) {
    const discoveryReady =
      !flow.discovery.isRunning && flow.discovery.discovery?.status === 'ready';
    return (
      <FlowActions
        secondary={
          <Button variant="ghost" size="md" onClick={() => flow.setStep(0)}>
            Back
          </Button>
        }
        primary={
          <Button size="md" onClick={() => flow.setStep(2)} disabled={!discoveryReady}>
            {flow.discovery.isRunning ? 'Searching…' : 'Review'}
          </Button>
        }
      />
    );
  }

  return (
    <FlowActions
      wide
      secondary={
        <Button
          variant="ghost"
          size="md"
          onClick={() => flow.setStep(1)}
          disabled={flow.isCompleting}
        >
          Back
        </Button>
      }
      primary={
        <Button
          size="md"
          onClick={() => flow.complete.mutate()}
          pending={flow.isCompleting}
          pendingLabel="Creating…"
          disabled={
            flow.completionFailed ||
            !flow.hasSelectedDomain ||
            flow.hasIncompleteCompetitor ||
            !hasConfirmedIcp(flow.profile)
          }
        >
          Create project
        </Button>
      }
    />
  );
}
