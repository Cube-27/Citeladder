import { Check, CircleAlert } from 'lucide-react';

import { cn } from '@/lib/utils';

export type ActivityStepState = 'complete' | 'active' | 'pending' | 'attention';

export type ActivityStep = {
  id: string;
  label: string;
  detail?: string;
  state: ActivityStepState;
};

/**
 * A compact, factual timeline for background product work.
 *
 * Callers own the mapping from API phases to user language. This component
 * deliberately knows nothing about queue states or worker vocabulary, which
 * prevents an internal token from becoming fallback UI copy.
 */
export function ActivityProgress({
  steps,
  label,
}: Readonly<{
  steps: ActivityStep[];
  label: string;
}>) {
  const completed = steps.filter((step) => step.state === 'complete').length;
  const activeStep = steps.find((step) => step.state === 'active' || step.state === 'attention');

  return (
    <section aria-label={label} className="grid gap-4">
      <div
        className="bg-neutral-bg h-1.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-label={`${completed} of ${steps.length} steps complete`}
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={completed}
      >
        <div
          className="bg-accent h-full rounded-full transition-[width] motion-reduce:transition-none"
          style={{ width: `${steps.length === 0 ? 0 : (completed / steps.length) * 100}%` }}
        />
      </div>

      <ol className="grid list-none gap-0 p-0">
        {steps.map((step, index) => (
          <li key={step.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3">
            <div className="flex flex-col items-center" aria-hidden>
              <span
                className={cn(
                  'relative z-1 flex size-6 shrink-0 items-center justify-center rounded-full',
                  step.state === 'complete' && 'bg-success text-accent-fg',
                  step.state === 'active' && 'bg-accent-subtle text-accent-text',
                  step.state === 'attention' && 'bg-warning-bg text-warning-text',
                  step.state === 'pending' && 'border-border-subtle bg-panel text-muted border',
                )}
              >
                {step.state === 'complete' ? (
                  <Check className="size-4" strokeWidth={3} />
                ) : step.state === 'attention' ? (
                  <CircleAlert className="size-4" />
                ) : step.state === 'active' ? (
                  <span className="activity-dot bg-accent size-2" />
                ) : (
                  <span className="bg-border-subtle size-1.5 rounded-full" />
                )}
              </span>
              {index < steps.length - 1 ? (
                <span className="bg-border-subtle min-h-5 w-px flex-1" />
              ) : null}
            </div>

            <div className={cn('min-w-0 pb-4', index === steps.length - 1 && 'pb-0')}>
              <p
                className={cn(
                  'text-sm font-medium',
                  step.state === 'pending' ? 'text-muted' : 'text-foreground',
                )}
              >
                {step.label}
              </p>
              {step.detail ? <p className="text-secondary mt-0.5 text-xs">{step.detail}</p> : null}
            </div>
          </li>
        ))}
      </ol>

      <span className="sr-only" aria-live="polite">
        {activeStep
          ? `${activeStep.label}. ${activeStep.detail ?? ''}`
          : `${completed} steps complete`}
      </span>
    </section>
  );
}
