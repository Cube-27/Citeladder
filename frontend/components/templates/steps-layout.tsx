import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

import { Pressable } from '@/components/ui/pressable';
import { sidebarNavRowClasses } from '@/components/ui/sidebar';
import { textRole } from '@/components/ui/typography';

export type StepItem<T extends string> = Readonly<{ value: T; label: string }>;

/**
 * Steps: a task worked through in order, inside a shell page's body. The
 * steps run down a 220 column on the left (numbered, the current one on the
 * nav's current tile, completed ones ticked and clickable to go back to),
 * the current step's content beside them, and a raised action bar pinned to
 * the window's foot: `footerStart` at its left, `footerEnd` at its right. The
 * body is at least the window under the masthead, so the bar never moves
 * with a step's height.
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
    <div className="flex min-h-[calc(100dvh-var(--masthead-height)-var(--page-pad-block))] min-w-0 flex-1 flex-col">
      <div className="desktop:grid-cols-[220px_minmax(0,1fr)] grid min-w-0 flex-1 content-start items-start gap-[var(--content-gutter)]">
        <nav aria-label={label} className="flex min-w-0 flex-col">
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
        <section aria-label={steps[index]?.label} className="min-w-0">
          {children}
        </section>
      </div>
      <div
        data-page-band="action-bar"
        className="bg-raised border-rule rounded-card shadow-pop z-sticky sticky bottom-[var(--content-gutter)] mt-[var(--workspace-gap)] flex min-h-[var(--filter-bar-height)] min-w-0 flex-nowrap items-center gap-2 border px-[var(--card-padding)] py-2"
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
          'grid size-5 shrink-0 place-items-center rounded-full border border-current',
        )}
      >
        {done ? <Check className="size-3" /> : position + 1}
      </span>
      <span className="truncate">{step.label}</span>
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
