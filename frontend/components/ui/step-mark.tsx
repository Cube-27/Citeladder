import { Icon } from '@/components/ui/icon';
import { Check } from '@/lib/icons';
import { cn } from '@/lib/utils';

export type StepState = 'done' | 'current' | 'next';

const FACE: Record<StepState, string> = {
  done: 'bg-primary text-on-primary',
  current: 'border-mark-ink text-ink font-emphasis border',
  next: 'border-control-line text-ink-2 border',
};

export function StepMark({ state, number }: Readonly<{ state: StepState; number: number }>) {
  return (
    <span
      aria-hidden
      className={cn(
        'text-caption grid size-5 shrink-0 place-items-center rounded-full tabular-nums',
        FACE[state],
      )}
    >
      {state === 'done' ? <Icon icon={Check} size="flush" /> : number}
    </span>
  );
}

export function stepState(position: number, current: number): StepState {
  if (position < current) return 'done';
  return position === current ? 'current' : 'next';
}
