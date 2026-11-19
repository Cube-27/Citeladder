import type { HTMLAttributes, ReactNode } from 'react';
import {
  Ban,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleMinus,
  CirclePause,
  CircleX,
  Clock,
  Frown,
  Globe,
  Info,
  Meh,
  OctagonAlert,
  OctagonX,
  Smile,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

/**
 * The tones a status may take: semantic hues appear
 * only in status marks, changes, notices and validation, and never alone.
 * `you` is the accent: only a citation's own-domain classification.
 */
export type StatusTone = 'neutral' | 'positive' | 'negative' | 'warning' | 'info' | 'you';

/** Each tone's chip: its wash as the fill and its text colour (neutral is the well and `ink-2`). */
const TONE_CHIP: Record<StatusTone, string> = {
  neutral: 'bg-well text-ink-2',
  positive: 'bg-positive-wash text-positive',
  negative: 'bg-negative-wash text-negative',
  warning: 'bg-warning-wash text-warning',
  info: 'bg-info-wash text-info',
  you: 'bg-accent-wash text-ink',
};

/** What a mark draws before its word: a glyph, the live rung, the "you" rung or priority bars. */
type Glyph = LucideIcon | 'live' | 'you' | Readonly<{ bars: 1 | 2 | 3 }>;

const TONE_GLYPH: Record<StatusTone, Glyph> = {
  neutral: Circle,
  positive: CircleCheck,
  negative: CircleX,
  warning: TriangleAlert,
  info: Info,
  you: 'you',
};

type Mark = Readonly<{ tone: StatusTone; glyph: Glyph }>;
const mark = (tone: StatusTone, glyph: Glyph = TONE_GLYPH[tone]): Mark => ({ tone, glyph });

/*
 * One vocabulary per domain, defined once: a product value resolves to a
 * tone and a glyph, so the same state reads the same mark wherever it shows.
 * The word always names the state; the glyph and tone repeat it (WCAG 1.4.1).
 */
const statusMarks = {
  success: mark('positive'),
  warning: mark('warning'),
  danger: mark('negative'),
  info: mark('info'),
} as const satisfies Record<string, Mark>;

const sentimentMarks = {
  positive: mark('positive', Smile),
  neutral: mark('neutral', Meh),
  negative: mark('negative', Frown),
  mixed: mark('warning', Meh),
} as const satisfies Record<string, Mark>;

/** Citation classification: your own pages carry the accent rung; everyone else is neutral. */
const classificationMarks = {
  owned: mark('you'),
  competitor: mark('neutral', Users),
  'third-party': mark('neutral', Globe),
} as const satisfies Record<string, Mark>;

/** Running and queued are info; partial and cancelled warning; failed negative. */
const runStatusMarks = {
  draft: mark('neutral', CircleDashed),
  queued: mark('info', Clock),
  running: mark('info', 'live'),
  paused: mark('neutral', CirclePause),
  analyzing: mark('info', 'live'),
  completed: mark('positive'),
  partial: mark('warning'),
  failed: mark('negative'),
  cancelled: mark('warning', Ban),
} as const satisfies Record<string, Mark>;

/**
 * Severity: High negative, Medium warning, Low neutral. Its glyphs belong to
 * severity alone, so a severity never reads as a run's or a check's state.
 */
const severityMarks = {
  critical: mark('negative', OctagonX),
  high: mark('negative', OctagonAlert),
  medium: mark('warning', CircleDot),
  low: mark('neutral', CircleMinus),
  info: mark('neutral', CircleMinus),
} as const satisfies Record<string, Mark>;

/**
 * Priority is an order, not a state: no hue, and three ascending bars with
 * three, two or one filled tell the three apart; the empty bars are drawn, so
 * the glyph keeps its shape at every level.
 */
const priorityMarks = {
  high: mark('neutral', { bars: 3 }),
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

function MarkGlyph({ glyph }: Readonly<{ glyph: Glyph }>) {
  if (glyph === 'live') return <Spinner />;
  if (glyph === 'you')
    return (
      <span aria-hidden className="inline-grid size-4 shrink-0 place-items-center">
        <span className="bg-accent rounded-mark block h-3 w-[var(--mark-width)]" />
      </span>
    );
  if (typeof glyph === 'object' && 'bars' in glyph) return <PriorityBars filled={glyph.bars} />;
  return <Icon icon={glyph} className="my-0" />;
}

/** Bar heights and left edges in a 16px box, lowest first. */
const PRIORITY_BARS = [
  { x: 2, height: 4 },
  { x: 7, height: 8 },
  { x: 12, height: 12 },
] as const;

function PriorityBars({ filled }: Readonly<{ filled: 1 | 2 | 3 }>) {
  return (
    <svg aria-hidden width={16} height={16} viewBox="0 0 16 16" className="shrink-0">
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
 * StatusMark — the only way to show a status, priority or severity: a chip
 * 24 high with radius 4, the tone's wash as its fill, the tone's text
 * colour, a glyph and a word, so a column of marks reads as a pattern and
 * every mark still says its state. A running state draws the live rung. It
 * is never cut: it sizes to its word, and its column's floor makes room.
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
  const { tone, glyph } = markOf(props);
  return (
    <span
      {...attributes}
      data-status-tone={tone}
      className={cn(
        'type-caption inline-flex font-medium h-[var(--tag-height)] shrink-0 items-center gap-1 rounded-mark px-2 align-middle whitespace-nowrap',
        TONE_CHIP[tone],
        className,
      )}
    >
      <MarkGlyph glyph={glyph} />
      <span>{children}</span>
    </span>
  );
}
