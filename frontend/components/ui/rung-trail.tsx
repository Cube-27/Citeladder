import { Check, ChevronRight, CircleHelp, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * The one state set every step takes: pending
 * (`rule` rung), running (the live ink rung), done (ink rung, check),
 * failed (crimson rung, cross), unavailable (hatched rung), unknown (hollow
 * rung, question glyph; never read as unavailable), awaiting your decision
 * (dashed rung, with the decision buttons) and decided (solid ink rung).
 */
export type RungStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'unavailable'
  | 'unknown'
  | 'awaiting'
  | 'decided';

export type TrailStep = Readonly<{
  /** Stable key; the label when omitted. */
  id?: string;
  label: string;
  status: RungStatus;
  /** One line: a count while running, the cause and next step on failure. */
  detail?: string | null;
  /** Elapsed or finishing time, already formatted ("0:42"). */
  time?: string;
  /** The decision buttons of an `awaiting` step. */
  actions?: ReactNode;
}>;

/** The word a screen reader hears after each label. */
const STATUS_WORD = {
  pending: 'Waiting',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  unavailable: 'Unavailable',
  unknown: 'Unknown',
  awaiting: 'Awaiting your decision',
  decided: 'Decided',
} as const satisfies Record<RungStatus, string>;

function rungFace(status: RungStatus) {
  switch (status) {
    case 'pending':
      return 'bg-rule';
    case 'running':
      return 'bg-ink animate-live-rung';
    case 'done':
    case 'decided':
      return 'bg-ink';
    case 'failed':
      return 'bg-negative';
    case 'unavailable':
      return 'hatch';
    case 'unknown':
      return 'border border-control-line';
    case 'awaiting':
      return 'border border-dashed border-control-line';
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

function StepGlyph({ status }: Readonly<{ status: RungStatus }>) {
  if (status === 'done' || status === 'decided')
    return <Icon icon={Check} className="text-ink-2 my-0" />;
  if (status === 'failed') return <Icon icon={X} className="text-negative my-0" />;
  if (status === 'unknown') return <Icon icon={CircleHelp} className="text-ink-2 my-0" />;
  return null;
}

/**
 * RungTrail — one rail with a rung per step: agent
 * activity, onboarding research, crawl and audit progress, readiness. The
 * vertical form lists steps down a rail with each step's label, detail and
 * time; the horizontal form lays a flow's steps across one rail. Every label
 * carries its status word for screen readers, so the trail reads without
 * the rungs.
 */
export function RungTrail({
  steps,
  label,
  orientation = 'vertical',
  className,
}: Readonly<{
  steps: readonly TrailStep[];
  /** What the steps are of ("Discovering your brand"). */
  label: string;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}>) {
  if (orientation === 'horizontal') {
    return (
      <ol
        aria-label={label}
        data-rung-trail="horizontal"
        className={cn('m-0 flex min-w-0 list-none flex-wrap p-0', className)}
      >
        {steps.map((step) => (
          <li
            key={step.id ?? step.label}
            aria-current={step.status === 'running' ? 'step' : undefined}
            className="relative flex min-w-0 flex-col gap-2 pe-6"
          >
            <span aria-hidden className="flex h-4 items-center">
              <span className="bg-rule absolute inset-x-0 top-2 h-px" />
              <span
                className={cn('rounded-mark relative block h-4 w-1.5', rungFace(step.status))}
              />
            </span>
            <span
              className={textRole(
                step.status === 'running' ? 'label' : 'body',
                step.status === 'pending' ? 'text-ink-2' : undefined,
              )}
            >
              {step.label}
              <span className="sr-only">, {STATUS_WORD[step.status]}</span>
            </span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol
      aria-label={label}
      data-rung-trail="vertical"
      className={cn('m-0 flex min-w-0 list-none flex-col p-0', className)}
    >
      {steps.map((step, index) => (
        <RungRow
          key={step.id ?? step.label}
          step={step}
          first={index === 0}
          last={index === steps.length - 1}
        />
      ))}
    </ol>
  );
}

/** One step: the rail and its rung, the glyph, the label and detail, the time. */
function RungRow({
  step,
  first,
  last,
}: Readonly<{ step: TrailStep; first: boolean; last: boolean }>) {
  return (
    <li
      aria-current={step.status === 'running' ? 'step' : undefined}
      data-rung-status={step.status}
      className="grid grid-cols-[0.75rem_1rem_minmax(0,1fr)_auto] gap-x-2 pb-2 last:pb-0"
    >
      <span aria-hidden className="relative flex h-5 justify-center">
        <span
          className={cn(
            'bg-rule absolute left-1/2 w-px -translate-x-1/2',
            first ? 'top-2.5' : 'top-0',
            last ? 'h-0' : '-bottom-2 h-auto',
          )}
        />
        <span className={cn('rounded-mark relative mt-2 block h-1 w-3', rungFace(step.status))} />
      </span>
      <span aria-hidden className="flex h-5 items-center">
        {step.status === 'running' ? <Spinner /> : <StepGlyph status={step.status} />}
      </span>
      <span className="flex min-w-0 flex-col">
        <span
          className={textRole(
            step.status === 'running' ? 'label' : 'body',
            step.status === 'pending' ? 'text-ink-2' : undefined,
          )}
        >
          {step.label}
          <span className="sr-only">, {STATUS_WORD[step.status]}</span>
        </span>
        {step.detail ? (
          <span
            className={textRole(
              'caption',
              cn('break-words', step.status === 'failed' && 'text-negative'),
            )}
          >
            {step.detail}
          </span>
        ) : null}
        {step.actions ? <span className="flex flex-wrap gap-2 pt-2">{step.actions}</span> : null}
      </span>
      <span className="type-data-sm text-ink-2 min-w-[6ch] text-right">{step.time}</span>
    </li>
  );
}

/**
 * A trail folded under a one-line summary: a finished turn's activity opens
 * from its summary; a running one shows its status and seconds in a line
 * that keeps one height from start to end, and announces only the status.
 */
export function FoldedTrail({
  summary,
  live,
  label,
  steps,
  empty,
}: Readonly<{
  summary?: ReactNode;
  /** The running form: the current status and the seconds since it started. */
  live?: Readonly<{ status: string; seconds: number }>;
  label: string;
  steps: readonly TrailStep[];
  /** What the open trail says before any step exists. */
  empty?: string;
}>) {
  return (
    <>
      <details className="group grid min-w-0">
        <summary
          className={textRole(
            'caption',
            'focus-ring flex min-h-6 min-w-0 cursor-pointer list-none items-center gap-2 rounded-control whitespace-nowrap [&::-webkit-details-marker]:hidden',
          )}
        >
          {live ? <Spinner /> : null}
          <span className="min-w-0 truncate">{live ? live.status : summary}</span>
          {live ? <span className="type-data-sm shrink-0">{live.seconds}s</span> : null}
          <Icon icon={ChevronRight} className="text-ink-2 my-0 shrink-0 group-open:rotate-90" />
        </summary>
        <div className="pt-3">
          {steps.length ? (
            <RungTrail steps={steps} label={label} />
          ) : (
            <p className={textRole('caption')}>{empty}</p>
          )}
        </div>
      </details>
      {live ? (
        // Outside the summary: a live region inside a button is not reliably announced.
        <output aria-live="polite" className="sr-only">
          {live.status}
        </output>
      ) : null}
    </>
  );
}
