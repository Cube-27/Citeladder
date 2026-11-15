import { Check, ChevronRight, CircleHelp, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * The one state set every step takes: pending
 * (`rule` rung), running (the live ink rung), done (ink rung, check),
 * failed (crimson rung, cross), unavailable (`well` rung and its word), unknown (hollow
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
      return 'bg-well';
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
        {/* The faint rung says it with its word; the label already says it to screen readers. */}
        {!step.detail && step.status === 'unavailable' ? (
          <span aria-hidden className={textRole('caption')}>
            {STATUS_WORD.unavailable}
          </span>
        ) : null}
        {step.actions ? <span className="flex flex-wrap gap-2 pt-2">{step.actions}</span> : null}
      </span>
      <span className="type-caption min-w-[6ch] text-right tabular-nums">{step.time}</span>
    </li>
  );
}

/** A setup step: finished, the one you are on (`next`, or `running` once started), or still to come. */
export type SetupStep = Readonly<{
  id: string;
  label: string;
  state: 'done' | 'next' | 'running' | 'waiting';
  /** The current step's one action. */
  action?: ReactNode;
}>;

const SETUP_WORD = {
  done: 'Done',
  next: 'Next',
  running: 'Running',
  waiting: 'Waiting',
} as const satisfies Record<SetupStep['state'], string>;

const SETUP_MARKER = {
  done: 'bg-positive text-surface',
  next: 'bg-accent',
  running: 'bg-accent',
  waiting: 'bg-surface border border-control-line',
} as const satisfies Record<SetupStep['state'], string>;

/**
 * SetupSteps — a checklist of setup steps, one line each on one connector:
 * a 12px marker (positive with a check when done, accent for the step you are
 * on, hollow while waiting), the title, its state word and, on the current
 * step, that step's action. Rows sit 40px apart.
 */
export function SetupSteps({
  steps,
  label,
}: Readonly<{ steps: readonly SetupStep[]; label: string }>) {
  return (
    <ol aria-label={label} className="m-0 flex min-w-0 list-none flex-col p-0">
      {steps.map((step, index) => {
        const current = step.state === 'next' || step.state === 'running';
        return (
          <li
            key={step.id}
            aria-current={current ? 'step' : undefined}
            data-setup-step={step.state}
            className="relative flex min-h-10 min-w-0 items-center gap-3"
          >
            {/* The connector runs through the markers' centres, between the first and last. */}
            <span
              aria-hidden
              className={cn(
                'bg-control-line absolute start-[5px] w-0.5',
                index === 0 ? 'top-1/2' : 'top-0',
                index === steps.length - 1 ? 'bottom-1/2' : 'bottom-0',
              )}
            />
            <span
              aria-hidden
              className={cn(
                'relative grid size-3 shrink-0 place-items-center rounded-[4px]',
                SETUP_MARKER[step.state],
              )}
            >
              {step.state === 'done' ? <Check className="size-2.5" strokeWidth={3} /> : null}
            </span>
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 py-1">
              <span className={textRole(current ? 'label' : 'body', 'text-ink min-w-0')}>
                {step.label}
              </span>
              <span className={textRole('caption', 'text-ink-2')}>
                <span className="sr-only">, </span>
                {SETUP_WORD[step.state]}
              </span>
              {current && step.action ? <span className="ms-auto">{step.action}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
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
          {live ? (
            <span className="type-caption shrink-0 text-current tabular-nums">{live.seconds}s</span>
          ) : null}
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
