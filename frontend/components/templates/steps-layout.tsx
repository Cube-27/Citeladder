import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

import { Pressable } from '@/components/ui/pressable';
import { sidebarNavRowClasses } from '@/components/ui/sidebar';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

export type StepItem<T extends string> = Readonly<{ value: T; label: string }>;

/**
 * Steps: a task worked through in order, in a `fitted` shell page's body. The
 * steps run down a 224 column on the left (numbered, the current one on the
 * nav's current tile, completed ones ticked and clickable to go back to),
 * the current step's content beside them, and a raised action bar at the
 * panel's foot: `footerStart` at its left, `footerEnd` at its right. The body
 * fills the panel and scrolls inside itself, so the bar never moves with a
 * step's height.
 */
export function StepsLayout<T extends string>({
  label,
  steps,
  current,
  onStep,
  note,
  footerStart,
  footerEnd,
  children,
}: Readonly<{
  /** The step list's accessible name. */
  label: string;
  steps: readonly StepItem<T>[];
  current: T;
  onStep: (step: T) => void;
  /** A faint line under the steps. */
  note?: ReactNode;
  footerStart: ReactNode;
  footerEnd: ReactNode;
  children: ReactNode;
}>) {
  const index = steps.findIndex((step) => step.value === current);
  return (
    <div className="flex h-[calc(100dvh-var(--route-chrome-height))] min-h-0 min-w-0 flex-col">
      {/* `relative` contains absolute descendants (`sr-only` text); without it they
          escape the clip, lengthen the panel and it scrolls the page header away. */}
      <div className="desktop:flex-row relative flex min-h-0 min-w-0 flex-1 flex-col gap-[var(--page-top-gap)] overflow-y-auto">
        <nav aria-label={label} className="flex w-56 shrink-0 flex-col">
          <ol className="flex min-w-0 flex-col gap-1">
            {steps.map((step, position) => (
              <li key={step.value}>
                <StepRow
                  step={step}
                  position={position}
                  current={index}
                  onStep={() => onStep(step.value)}
                />
              </li>
            ))}
          </ol>
          {note ? <p className={textRole('caption', 'text-ink-2 px-2 pt-3')}>{note}</p> : null}
        </nav>
        <section aria-label={steps[index]?.label} className="min-w-0 flex-1">
          {children}
        </section>
      </div>
      <div
        data-page-band="action-bar"
        className="bg-raised border-rule rounded-card shadow-pop mt-[var(--workspace-gap)] flex min-h-[var(--filter-bar-height)] min-w-0 shrink-0 flex-wrap items-center gap-2 border px-[var(--card-padding)] py-2"
      >
        {footerStart}
        <span className="flex-1" />
        {footerEnd}
      </div>
    </div>
  );
}

/** One step: a done step is a button back to it; the current and later ones are not. */
function StepRow<T extends string>({
  step,
  position,
  current,
  onStep,
}: Readonly<{ step: StepItem<T>; position: number; current: number; onStep: () => void }>) {
  const done = position < current;
  const face = (
    <>
      <span
        aria-hidden
        className={textRole(
          'caption',
          cn(
            'grid size-4 shrink-0 place-items-center rounded-full tabular-nums',
            done && 'text-ink-2',
            position === current && 'border-ink text-ink border',
            position > current && 'border-control-line text-ink-2 border',
          ),
        )}
      >
        {done ? <Check className="size-3.5" /> : position + 1}
      </span>
      <span className={cn('truncate', position > current && 'text-ink-2')}>{step.label}</span>
    </>
  );
  if (done) {
    return (
      <Pressable className={sidebarNavRowClasses(false)} onClick={onStep}>
        {face}
        <span className="sr-only">(completed)</span>
      </Pressable>
    );
  }
  return (
    <span
      aria-current={position === current ? 'step' : undefined}
      className={sidebarNavRowClasses(position === current, 'pointer-events-none')}
    >
      {face}
    </span>
  );
}
