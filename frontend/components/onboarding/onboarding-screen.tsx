'use client';

import { Link, useLocation } from 'react-router-dom';

import { FlowActions, FlowShell, type FlowStep } from '@/components/auth/flow-shell';
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
  const projectsHref = activeProjectId
    ? projectDestination('/projects', null, activeProjectId)
    : '/projects';
  const stage = onboardingStage(flow);
  const measure = !flow.isCompleting && flow.step === 2 ? 'wide' : 'default';

  return (
    <FlowShell
      mainLabel="Project setup"
      steps={STEPS}
      currentStep={flow.step}
      // First-time setup has nowhere in the product to exit TO: the workspace
      // has no projects, so `/projects` would send the reader straight back
      // here. It used to leave for the marketing site instead, which dropped a
      // signed-in reader out of the product entirely. The account menu is the
      // honest way out, and it is now in the bar beside this.
      exitHref={flow.isAdditional ? projectsHref : undefined}
      trailing={<UserMenuTrigger presenter="compact" />}
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
}: Readonly<{ flow: ReturnType<typeof useOnboardingFlow>; projectsHref: string }>) {
  if (flow.step === 0) {
    return (
      <FlowActions
        secondary={
          flow.isAdditional ? (
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
            flow.completionFailed || !flow.hasSelectedDomain || !hasConfirmedIcp(flow.profile)
          }
        >
          Create project
        </Button>
      }
    />
  );
}
