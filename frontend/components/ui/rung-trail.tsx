import type { ReactNode } from 'react';

import { Icon } from '@/components/ui/icon';
import { SLIP_FACE } from '@/components/ui/slip';
import { Spinner } from '@/components/ui/spinner';
import { textRole } from '@/components/ui/typography';
import { Check, ChevronRight, CircleHelp, X } from '@/lib/icons';
import { cn } from '@/lib/utils';

/**
 * The one state set every step takes: pending
 * (`rule` rung), running (the live ink rung), done (ink rung, check),
 * failed (crimson rung, cross), unavailable (`well` rung and its word), unknown (hollow
 * rung, question glyph; never read as unavailable).
 */
export type RungStatus = 'pending' | 'running' | 'done' | 'failed' | 'unavailable' | 'unknown';

export type TrailStep = Readonly<{
  /** Stable key; the label when omitted. */
  id?: string;
  label: string;
  status: RungStatus;
  /** One line: a count while running, the cause and next step on failure. */
  detail?: string | null;
  /** Elapsed or finishing time, already formatted ("0:42"). */
  time?: string;
}>;

/** The word a screen reader hears after each label. */
const STATUS_WORD = {
  pending: 'Waiting',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  unavailable: 'Unavailable',
  unknown: 'Unknown',
} as const satisfies Record<RungStatus, string>;

function rungFace(status: RungStatus) {
  switch (status) {
    case 'pending':
      return 'bg-rule';
    case 'running':
      return 'bg-ink animate-live-rung';
    case 'done':
      return 'bg-ink';
    case 'failed':
      return 'bg-negative';
    case 'unavailable':
      return 'bg-well';
    case 'unknown':
      return 'border border-control-line';
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

function StepGlyph({ status }: Readonly<{ status: RungStatus }>) {
  if (status === 'done') return <Icon icon={Check} className="text-ink-2 my-0" />;
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
 * the rungs. `size="lg"` (a setup flow's steps) sets the vertical form's
 * labels at 16 and its rows 12 apart.
 */
export function RungTrail({
  steps,
  label,
  orientation = 'vertical',
  size = 'md',
  className,
}: Readonly<{
  steps: readonly TrailStep[];
  /** What the steps are of ("Discovering your brand"). */
  label: string;
  orientation?: 'vertical' | 'horizontal';
  size?: RowSize;
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
          size={size}
        />
      ))}
    </ol>
  );
}

type RowSize = 'md' | 'lg';

/**
 * A row's geometry per size: the line its rung and glyph centre on, the rail
 * and how its connector reaches the next row, and the label's role. `md`
 * bridges its 8 gap from a one-line rail; `lg`'s rail stretches down the
 * row, its 12 gap sitting under the label. The `lg` label (16/24) keeps one
 * role and only gains weight while running, so a row never changes height.
 */
const ROW_SIZE = {
  md: {
    row: 'pb-2',
    rail: 'h-5',
    line: 'h-5',
    railTop: 'top-2.5',
    bridge: '-bottom-2 h-auto',
    gap: '',
    label: (running: boolean) => textRole(running ? 'label' : 'body'),
  },
  lg: {
    row: '',
    rail: '',
    line: 'h-6',
    railTop: 'top-3',
    bridge: 'bottom-0',
    gap: 'pb-3',
    label: (running: boolean) => textRole('prose', cn('leading-6', running && 'type-emphasis')),
  },
} as const satisfies Record<RowSize, unknown>;

/** One step: the rail and its rung, the glyph, the label and detail, the time. */
function RungRow({
  step,
  first,
  last,
  size,
}: Readonly<{ step: TrailStep; first: boolean; last: boolean; size: RowSize }>) {
  const geometry = ROW_SIZE[size];
  return (
    <li
      aria-current={step.status === 'running' ? 'step' : undefined}
      data-rung-status={step.status}
      className={cn(
        'grid grid-cols-[0.75rem_1rem_minmax(0,1fr)_auto] gap-x-2 last:pb-0',
        geometry.row,
      )}
    >
      <span aria-hidden className={cn('relative flex justify-center', geometry.rail)}>
        <span
          className={cn(
            'bg-rule absolute left-1/2 w-px -translate-x-1/2',
            first ? geometry.railTop : 'top-0',
            last ? 'h-0' : geometry.bridge,
          )}
        />
        <span className={cn('relative flex items-center', geometry.line)}>
          <span className={cn('rounded-mark block h-1 w-3', rungFace(step.status))} />
        </span>
      </span>
      <span aria-hidden className={cn('flex items-center', geometry.line)}>
        {step.status === 'running' ? <Spinner /> : <StepGlyph status={step.status} />}
      </span>
      <span className={cn('flex min-w-0 flex-col', !last && geometry.gap)}>
        <span
          className={cn(
            geometry.label(step.status === 'running'),
            step.status === 'pending' && 'text-ink-2',
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

/**
 * SetupSteps — a checklist of setup steps in a framed list of 40px rows: a
 * check once done, the step's title and its state word, and on the step you
 * are on a 2px accent mark (it is "here"), the title at 500 and its action
 * at the row's end. Waiting steps are in the secondary ink.
 */
export function SetupSteps({
  steps,
  label,
}: Readonly<{ steps: readonly SetupStep[]; label: string }>) {
  return (
    <ol
      aria-label={label}
      className={cn(SLIP_FACE, 'divide-rule m-0 list-none divide-y overflow-hidden p-0')}
    >
      {steps.map((step) => {
        const current = step.state === 'next' || step.state === 'running';
        return (
          <li
            key={step.id}
            aria-current={current ? 'step' : undefined}
            data-setup-step={step.state}
            className="relative flex min-h-10 min-w-0 items-center gap-2 px-4"
          >
            {current ? (
              <span
                aria-hidden
                className="bg-accent absolute inset-y-2 start-0 w-0.5 rounded-full"
              />
            ) : null}
            <span aria-hidden className="flex w-4 shrink-0 justify-center">
              {step.state === 'done' ? <Icon icon={Check} className="text-ink-2 my-0" /> : null}
              {step.state === 'running' ? <Spinner /> : null}
            </span>
            <span
              className={textRole(
                current ? 'label' : 'body',
                cn('min-w-0 truncate', step.state === 'waiting' ? 'text-ink-2' : 'text-ink'),
              )}
            >
              {step.label}
            </span>
            <span className={textRole('caption', 'text-ink-2 shrink-0')}>
              <span className="sr-only">, </span>
              {SETUP_WORD[step.state]}
            </span>
            {current && step.action ? (
              <span className="ms-auto shrink-0">{step.action}</span>
            ) : null}
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
