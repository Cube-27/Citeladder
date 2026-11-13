import { Check, ChevronRight, CircleAlert, CircleDashed, CircleHelp } from 'lucide-react';
import type { ReactNode } from 'react';

import { Disclosure } from './disclosure';
import { Icon } from './icon';
import { Stack } from './layout';
import { Shimmer } from './shimmer';
import { Spinner } from './spinner';
import { textRole } from './typography';
import { treeBranchClasses } from './workspace';

export type ChainStepStatus = 'running' | 'done' | 'unavailable' | 'failed' | 'unknown';

/**
 * ChainOfThought — what an assistant did for one answer (the AI Elements Chain
 * of Thought pattern): a collapsed one-line summary that opens to its steps.
 * The words carry the meaning; each step's glyph only echoes its status.
 */
export function ChainOfThought({
  summary,
  label,
  children,
}: Readonly<{ summary: ReactNode; label: string; children: ReactNode }>) {
  return (
    <Disclosure title={summary}>
      <Stack as="ol" gap="tight" aria-label={label} className={treeBranchClasses()}>
        {children}
      </Stack>
    </Disclosure>
  );
}

/**
 * The running form of ChainOfThought: one status line that keeps its height
 * from the turn's start to its end. The status cuts to one line and the
 * seconds keep their width, so nothing under it moves; it opens to the steps.
 * Only the status is announced; the seconds tick outside the live region.
 */
export function ChainOfThoughtLive({
  status,
  seconds,
  label,
  children,
}: Readonly<{ status: string; seconds: number; label: string; children: ReactNode }>) {
  return (
    <>
      <details className="group grid min-w-0">
        <summary
          className={textRole(
            'caption',
            'focus-ring flex min-h-6 min-w-0 cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden gap-2 rounded-md whitespace-nowrap',
          )}
        >
          <Spinner className="text-ink-muted" />
          <Shimmer className="min-w-0 truncate">{status}</Shimmer>
          <span className="text-ink-muted shrink-0 tabular-nums">{seconds}s</span>
          <Icon icon={ChevronRight} className="text-ink-muted shrink-0 group-open:rotate-90" />
        </summary>
        <Stack as="ol" gap="tight" aria-label={label} className={treeBranchClasses('mt-3')}>
          {children}
        </Stack>
      </details>
      {/* Outside the summary: a live region inside a button is not reliably announced. */}
      <output aria-live="polite" className="sr-only">
        {status}
      </output>
    </>
  );
}

function StepGlyph({ status }: Readonly<{ status: ChainStepStatus }>) {
  switch (status) {
    case 'running':
      return <Spinner className="text-ink-muted shrink-0" />;
    case 'done':
      return <Icon icon={Check} className="text-ink-muted shrink-0" />;
    case 'unavailable':
      return <Icon icon={CircleDashed} className="text-ink-muted shrink-0" />;
    case 'failed':
      return <Icon icon={CircleAlert} className="text-negative shrink-0" />;
    case 'unknown':
      return <Icon icon={CircleHelp} className="text-ink-muted shrink-0" />;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** One step on one line: its glyph, what was done, and a muted detail cut to fit. */
export function ChainOfThoughtStep({
  label,
  detail,
  status,
}: Readonly<{ label: string; detail?: string | null; status: ChainStepStatus }>) {
  return (
    <li className={textRole('caption', 'flex min-w-0 items-center gap-2')}>
      <StepGlyph status={status} />
      <span className="shrink-0">{label}</span>
      {detail ? (
        <>
          {' '}
          <span className="text-ink-muted min-w-0 truncate">{detail}</span>
        </>
      ) : null}
    </li>
  );
}
