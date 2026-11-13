import { Check, CircleAlert, CircleHelp } from 'lucide-react';
import type { ReactNode } from 'react';

import { Disclosure } from './disclosure';
import { Icon } from './icon';
import { Stack } from './layout';
import { Spinner } from './spinner';
import { textRole } from './typography';
import { treeBranchClasses } from './workspace';

export type ChainStepStatus = 'running' | 'done' | 'failed' | 'unknown';

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

function StepGlyph({ status }: Readonly<{ status: ChainStepStatus }>) {
  switch (status) {
    case 'running':
      return <Spinner className="text-ink-muted shrink-0" />;
    case 'done':
      return <Icon icon={Check} className="text-ink-muted shrink-0" />;
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
