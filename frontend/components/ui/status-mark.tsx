import type { HTMLAttributes, ReactNode } from 'react';

import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

/**
 * The tones a status may take: semantic hues appear
 * only in status marks, changes, notices and validation, and never alone.
 * `you` is the accent: only a citation's own-domain classification.
 */
export type StatusTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'info' | 'you';

/** Each tone's 6px dot. */
const TONE_DOT: Record<StatusTone, string> = {
  neutral: 'bg-ink-2',
  positive: 'bg-positive',
  negative: 'bg-negative',
  warning: 'bg-warning',
  info: 'bg-info',
  you: 'bg-accent',
};

/** What a mark draws before its word: the tone's dot, the live rung or priority bars. */
type Glyph = 'dot' | 'live' | Readonly<{ bars: 1 | 2 | 3 }>;

type Mark = Readonly<{ tone: StatusTone; glyph: Glyph }>;
const mark = (tone: StatusTone, glyph: Glyph = 'dot'): Mark => ({ tone, glyph });

/*
 * One vocabulary per domain, defined once: a product value resolves to a
 * tone, so the same state reads the same mark wherever it shows. The word
 * always names the state; the dot's tone repeats it (WCAG 1.4.1).
 */
const statusMarks = {
  success: mark('positive'),
  warning: mark('warning'),
  danger: mark('negative'),
  info: mark('info'),
} as const satisfies Record<string, Mark>;

const sentimentMarks = {
  positive: mark('positive'),
  neutral: mark('neutral'),
  negative: mark('negative'),
  mixed: mark('warning'),
} as const satisfies Record<string, Mark>;

/** Citation classification: your own pages carry the accent; everyone else is neutral. */
const classificationMarks = {
  owned: mark('you'),
  competitor: mark('neutral'),
  'third-party': mark('neutral'),
} as const satisfies Record<string, Mark>;

/** Running and queued are info; partial and cancelled warning; failed negative. */
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

/**
 * Severity: Critical and High negative, Medium warning, Low and Info neutral.
 */
const severityMarks = {
  critical: mark('negative'),
  high: mark('negative'),
  medium: mark('warning'),
  low: mark('neutral'),
  info: mark('neutral'),
} as const satisfies Record<string, Mark>;

/**
 * Priority is an order: three ascending bars with three, two or one filled
 * tell the three apart, and the empty bars are drawn, so the glyph keeps its
 * shape. High alone takes a hue, so it stands apart from Medium at a glance.
 */
const priorityMarks = {
  high: mark('negative', { bars: 3 }),
  medium: mark('neutral', { bars: 2 }),
  low: mark('neutral', { bars: 1 }),
} as const satisfies Record<string, Mark>;

export type StatusValue = keyof typeof statusMarks;
export type PriorityValue = keyof typeof priorityMarks;
export type SentimentValue = keyof typeof sentimentMarks;
export type ClassificationValue = keyof typeof classificationMarks;
export type RunStatusValue = keyof typeof runStatusMarks;
type SeverityValue = keyof typeof severityMarks;

export type StatusMarkProps = {
  children: ReactNode;
  className?: string;
} & (
  | { variant: 'status'; value: StatusValue }
  | { variant: 'severity'; value: SeverityValue }
  | { variant: 'sentiment'; value: SentimentValue }
  | { variant: 'classification'; value: ClassificationValue }
  | { variant: 'run-status'; value: RunStatusValue }
  | { variant: 'priority'; value: PriorityValue }
  | { variant?: undefined; value?: undefined; tone?: StatusTone }
) &
  Omit<HTMLAttributes<HTMLSpanElement>, 'children'>;

function markOf(props: StatusMarkProps): Mark {
  switch (props.variant) {
    case 'status':
      return statusMarks[props.value];
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

function MarkGlyph({ tone, glyph }: Mark) {
  if (glyph === 'live') return <Spinner />;
  if (glyph === 'dot')
    return <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[tone])} />;
  return <PriorityBars filled={glyph.bars} tone={tone} />;
}

/** Bar heights and left edges in a 16px box, lowest first. */
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
      className={cn('shrink-0', tone === 'negative' && 'text-negative')}
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

/**
 * StatusMark — the only way to show a status, priority or severity: the
 * tone's 6px dot and a 12px word at 500 in `ink`, 20 high, with no frame;
 * priority's bars sit in a pill (radius full, a `rule` edge), so a column of marks reads as a pattern and
 * every mark still says its state. A running state draws the live rung,
 * priority its bars. It is never cut: it sizes to its word, and its column's
 * floor makes room.
 */
export function StatusMark(props: Readonly<StatusMarkProps>) {
  const {
    children,
    className,
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
        'type-caption text-ink inline-flex h-5 shrink-0 items-center gap-1.5 align-middle font-medium whitespace-nowrap',
        // A dot or live mark is bare text (owner, 2026-11-21); priority bars keep the pill.
        typeof statusMark.glyph === 'object' && 'border-rule rounded-full border px-2',
        className,
      )}
    >
      <MarkGlyph {...statusMark} />
      <span>{children}</span>
    </span>
  );
}
