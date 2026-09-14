'use client';

import { Link } from 'react-router-dom';
import { useLocation, useSearchParams } from 'react-router-dom';

import { FlowActions, FlowShell, type FlowStep } from '@/components/auth/flow-shell';
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
  const pathname = useLocation().pathname;
  const searchParams = useSearchParams()[0];
  // Cached routes may retain component state. A fresh Add project URL must
  // start a fresh transaction, and a hidden route must not keep redirecting.
  if (pathname.replace(/\/+$/, '') !== '/onboarding') return null;
  return <OnboardingTransaction key={searchParams?.get('discovery') ?? 'new'} />;
}

function OnboardingTransaction() {
  const flow = useOnboardingFlow();
  const { activeProjectId } = useProjectContext();
  const projectsHref = activeProjectId
    ? projectDestination('/projects', null, activeProjectId)
    : '/projects';
  const stage = flow.isCompleting ? (
    <CreationStage committedProjectId={flow.completedProjectId} />
  ) : flow.step === 0 ? (
    <BrandStage form={flow.form} isAdditional={flow.isAdditional} onSubmit={flow.submitBrand} />
  ) : flow.step === 1 ? (
    <DiscoveryStage
      brandName={flow.brand?.brand_name}
      discovery={flow.discovery}
      onEdit={() => flow.setStep(0)}
    />
  ) : (
    <ReviewStage flow={flow} />
  );

  return (
    <FlowShell
      mainLabel="Project setup"
      steps={STEPS}
      currentStep={flow.step}
      exitHref={flow.isAdditional ? projectsHref : '/'}
      align={flow.isCompleting ? 'center' : 'start'}
      measure={flow.isCompleting ? 'default' : flow.step === 2 ? 'wide' : 'default'}
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
