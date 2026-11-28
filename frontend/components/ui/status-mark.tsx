import type { HTMLAttributes, ReactNode } from 'react';

import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

export type StatusTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'info' | 'you';

const MARK_STROKE = 1.5;
const MARK_RADIUS = 6;
const RING_RADIUS = 4.25;

const INNER_STROKE = {
  fill: 'none',
  strokeWidth: MARK_STROKE,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const TONE_INK: Record<StatusTone, string> = {
  neutral: 'text-ink-2',
  positive: 'text-positive',
  negative: 'text-negative',
  warning: 'text-warning',
  info: 'text-info',
  you: 'text-accent',
};

const TONE_FILL: Record<StatusTone, string> = {
  neutral: 'bg-raised-2',
  positive: 'bg-positive-wash',
  negative: 'bg-negative-wash',
  warning: 'bg-warning-wash',
  info: 'bg-info-wash',
  you: 'bg-accent-wash',
};

const TONE_SHAPE: Record<StatusTone, ReactNode> = {
  neutral: (
    <circle
      cx={MARK_RADIUS}
      cy={MARK_RADIUS}
      r={RING_RADIUS}
      fill="none"
      stroke="currentColor"
      strokeWidth={MARK_STROKE}
    />
  ),
  positive: (
    <>
      <circle cx={MARK_RADIUS} cy={MARK_RADIUS} r={MARK_RADIUS} fill="currentColor" />
      <path d="M3.4 6.2 5.2 8l3.4-3.8" className="stroke-panel" {...INNER_STROKE} />
    </>
  ),
  negative: (
    <>
      <circle cx={MARK_RADIUS} cy={MARK_RADIUS} r={MARK_RADIUS} fill="currentColor" />
      <path d="m4 4 4 4m0-4-4 4" className="stroke-panel" {...INNER_STROKE} />
    </>
  ),
  warning: (
    <>
      <path
        d="M6 .6 11.7 10.9H.3z"
        fill="currentColor"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path d="M6 4.2v3m0 1.9v.1" className="stroke-panel" {...INNER_STROKE} />
    </>
  ),
  info: (
    <>
      <circle cx={MARK_RADIUS} cy={MARK_RADIUS} r={MARK_RADIUS} fill="currentColor" />
      <path d="M6 5.6v3.2m0-5.5v.1" className="stroke-panel" {...INNER_STROKE} />
    </>
  ),
  you: <path d="M6 .5 11.5 6 6 11.5.5 6z" fill="currentColor" />,
};

type Glyph = 'dot' | 'live' | Readonly<{ bars: 1 | 2 | 3 }>;

type Mark = Readonly<{ tone: StatusTone; glyph: Glyph }>;
const mark = (tone: StatusTone, glyph: Glyph = 'dot'): Mark => ({ tone, glyph });

const sentimentMarks = {
  positive: mark('positive'),
  neutral: mark('neutral'),
  negative: mark('negative'),
  mixed: mark('warning'),
} as const satisfies Record<string, Mark>;

const classificationMarks = {
  owned: mark('you'),
  competitor: mark('neutral'),
  'third-party': mark('neutral'),
} as const satisfies Record<string, Mark>;

const runStatusMarks = {
  draft: mark('neutral'),
  queued: mark('info'),
  running: mark('info', 'live'),
  paused: mark('neutral'),
  analyzing: mark('info', 'live'),
  completed: mark('positive'),
  partial: mark('warning'),
  failed: mark('negative'),
  cancelled: mark('warning'),
} as const satisfies Record<string, Mark>;

const priorityMarks = {
  high: mark('negative', { bars: 3 }),
  medium: mark('warning', { bars: 2 }),
  low: mark('neutral', { bars: 1 }),
} as const satisfies Record<string, Mark>;

const severityMarks = {
  critical: priorityMarks.high,
  ...priorityMarks,
  info: mark('neutral'),
} as const satisfies Record<string, Mark>;

export type PriorityValue = keyof typeof priorityMarks;
export type SentimentValue = keyof typeof sentimentMarks;
export type ClassificationValue = keyof typeof classificationMarks;
export type RunStatusValue = keyof typeof runStatusMarks;
type SeverityValue = keyof typeof severityMarks;

type StatusMarkProps = {
  children: ReactNode;
  full?: boolean;
} & (
  | { variant: 'severity'; value: SeverityValue }
  | { variant: 'sentiment'; value: SentimentValue }
  | { variant: 'classification'; value: ClassificationValue }
  | { variant: 'run-status'; value: RunStatusValue }
  | { variant: 'priority'; value: PriorityValue }
  | { variant?: undefined; value?: undefined; tone?: StatusTone }
) &
  Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'className' | 'style'>;

function markOf(props: StatusMarkProps): Mark {
  switch (props.variant) {
    case 'severity':
      return severityMarks[props.value];
    case 'sentiment':
      return sentimentMarks[props.value];
    case 'classification':
      return classificationMarks[props.value];
    case 'run-status':
      return runStatusMarks[props.value];
    case 'priority':
      return priorityMarks[props.value];
    case undefined:
      return mark(props.tone ?? 'neutral');
    default: {
      const unreachable: never = props;
      return unreachable;
    }
  }
}

const progressMarks = {
  open: { tone: 'neutral', fill: 0 },
  active: { tone: 'warning', fill: 0 },
  done: { tone: 'positive', fill: 1 },
  declined: { tone: 'negative', fill: 0.15 },
} as const satisfies Record<string, Readonly<{ tone: StatusTone; fill: number }>>;

export type ProgressValue = keyof typeof progressMarks;

const PROGRESS_RADIUS = 5.25;

export function ProgressGlyph({ value }: Readonly<{ value: ProgressValue }>) {
  const { tone, fill } = progressMarks[value];
  return (
    <svg aria-hidden viewBox="0 0 12 12" className={cn('size-3 shrink-0', TONE_INK[tone])}>
      <circle
        cx={MARK_RADIUS}
        cy={MARK_RADIUS}
        r={PROGRESS_RADIUS}
        fill="currentColor"
        fillOpacity={fill}
        stroke="currentColor"
        strokeWidth={MARK_STROKE}
      />
      {value === 'active' ? <path d="M6 .75a5.25 5.25 0 0 1 0 10.5z" fill="currentColor" /> : null}
    </svg>
  );
}

function ToneGlyph({ tone, size = 'sm' }: Readonly<{ tone: StatusTone; size?: 'sm' | 'md' }>) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      className={cn(size === 'md' ? 'size-4' : 'size-3', 'shrink-0', TONE_INK[tone])}
    >
      {TONE_SHAPE[tone]}
    </svg>
  );
}

function MarkGlyph({ tone, glyph }: Mark) {
  if (glyph === 'live') return <Spinner />;
  if (glyph === 'dot') return <ToneGlyph tone={tone} />;
  return <PriorityBars filled={glyph.bars} tone={tone} />;
}

const PRIORITY_BARS = [
  { x: 2, height: 4 },
  { x: 7, height: 8 },
  { x: 12, height: 12 },
] as const;

function PriorityBars({ filled, tone }: Readonly<{ filled: 1 | 2 | 3; tone: StatusTone }>) {
  return (
    <svg
      aria-hidden
      width={16}
      height={16}
      viewBox="0 0 16 16"
      className={cn('shrink-0', TONE_INK[tone])}
    >
      {PRIORITY_BARS.map((bar, index) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={14 - bar.height}
          width={3}
          height={bar.height}
          rx={0.5}
          className={index < filled ? 'fill-current' : 'fill-control-line'}
        />
      ))}
    </svg>
  );
}

export function StatusMark(props: Readonly<StatusMarkProps>) {
  const {
    children,
    full = false,
    variant: _variant,
    value: _value,
    tone: _tone,
    ...attributes
  } = { tone: undefined, ...props };
  const statusMark = markOf(props);
  return (
    <span
      {...attributes}
      data-status-tone={statusMark.tone}
      className={cn(
        'text-caption text-ink inline-flex h-5 shrink-0 items-center gap-1 rounded-full ps-1.5 pe-2 align-middle font-emphasis whitespace-nowrap',
        TONE_FILL[statusMark.tone],
        full && 'max-w-full',
      )}
    >
      <MarkGlyph {...statusMark} />
      <span>{children}</span>
    </span>
  );
}
