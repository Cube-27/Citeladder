import { cn } from '@/lib/utils';

export type StateDotTone = 'open' | 'active' | 'done' | 'declined' | 'due';

const COLOR: Record<StateDotTone, string> = {
  open: 'text-ink-2',
  active: 'text-warning',
  done: 'text-positive',
  declined: 'text-negative',
  due: 'text-warning',
};

const FILL_OPACITY: Partial<Record<StateDotTone, number>> = { done: 1, declined: 0.15 };

const DOT_RADIUS = 5.25;
const DOT_STROKE = 1.5;

export function StateDot({ tone }: Readonly<{ tone: StateDotTone }>) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className={cn('size-3 shrink-0', COLOR[tone])}>
      <circle
        cx={6}
        cy={6}
        r={DOT_RADIUS}
        fill="currentColor"
        fillOpacity={FILL_OPACITY[tone] ?? 0}
        stroke="currentColor"
        strokeWidth={DOT_STROKE}
      />
      {tone === 'active' ? <path d="M6 .75a5.25 5.25 0 0 1 0 10.5z" fill="currentColor" /> : null}
    </svg>
  );
}
