import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { Absence } from '@/components/ui/absence';
import { Button } from '@/components/ui/button';
import { Notice, readErrorProps, type RetryableRead } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { textRole } from '@/components/ui/typography';
import { LOADING_INDICATOR_DELAY_MS } from '@/lib/config/operational';
import { cn } from '@/lib/utils';

const HEADING_TAG = { 1: 'h1', 2: 'h2', 3: 'h3' } as const;
type HeadingLevel = keyof typeof HEADING_TAG;

/**
 * The heading level a block state takes when its caller names none: 2 on a
 * page, 3 inside a Card, Section or DataTable whose own title is the h2 rung.
 */
export const StateHeadingLevelContext = createContext<HeadingLevel>(2);

type BlockEmpty = Readonly<{
  kind: 'empty';
  inline?: false;
  icon?: LucideIcon;
  heading: string;
  /** One sentence: what is missing and what to do about it. */
  description?: string;
  /** One primary control; a second only when both are equal choices. */
  action?: ReactNode;
  headingLevel?: HeadingLevel;
}>;

type InlineEmpty = Readonly<{
  kind: 'empty';
  inline: true;
  /** One short sentence: what is absent. */
  message: ReactNode;
  icon?: LucideIcon;
  /** One control (a `TextLink` or a `Button`). */
  action?: ReactNode;
  /** One line with no well, for a small slip or a table row. */
  compact?: boolean;
}>;

/** A read that has rows, none of which match the current filters. */
type FilteredEmpty = Readonly<{
  kind: 'filtered';
  /** What the filters hid ("No prompts match these filters"). */
  heading?: string;
  /** Clears every filter and search term. */
  onClear: () => void;
  headingLevel?: HeadingLevel;
}>;

/** What a not-measured read says: what fills it, and the one step that does. */
type NotMeasuredCopy = Readonly<{
  /** One sentence: what measures this and when it appears. */
  description: string;
  /** One primary control. */
  action?: ReactNode;
}>;

type NotMeasured = NotMeasuredCopy &
  Readonly<{
    kind: 'not_measured';
    headingLevel?: HeadingLevel;
  }>;

export type StateBlockProps =
  | Readonly<{
      kind: 'loading';
      /** What is loading, announced to assistive technology. */
      label?: string;
    }>
  | Readonly<{
      kind: 'error';
      error: unknown;
      /** The message when the error carries none of its own. */
      fallback: string;
      /** Retries exactly the read that failed. */
      onRetry: () => void;
      pending?: boolean;
      /** Names what failed to load, above the error's message. */
      title?: string;
    }>
  | NotMeasured
  | BlockEmpty
  | FilteredEmpty
  | InlineEmpty;

/** The read a screen state is derived from: a TanStack query, or its shape. */
type ScreenRead<T> = RetryableRead &
  (
    | Readonly<{ status: 'pending' }>
    | Readonly<{ status: 'error' }>
    | Readonly<{ status: 'success'; data: T }>
  );

/** A read's measured content, or the `StateBlock` it shows instead. */
type ScreenState<M> =
  | Readonly<{ kind: 'ready'; data: M }>
  | Readonly<{ kind: 'state'; state: StateBlockProps }>;

type Subject = Readonly<{
  /** What the read loads, in a sentence: "the business map" → "Couldn't load the business map". */
  subject: string;
}>;

type MeasuredOptions<T, M extends T> = Subject &
  Readonly<{
    /** True when the persisted answer holds a measurement; false is "Not measured yet". */
    measured: (data: T) => data is M;
    notMeasured: NotMeasuredCopy;
  }>;

/**
 * Maps one read to what its screen shows, keeping unknown apart from zero
 * (invariant 7): pending is loading, a failure is "Couldn't load …" with
 * Retry for exactly that read, a success without a measurement is "Not
 * measured yet", and only a measured answer reaches the content. A read whose
 * refetch failed reports the failure rather than its stale answer.
 *
 * Pass only a read that has been asked: a disabled query stays pending, so
 * the caller renders why nothing was asked before calling this.
 */
export function screenState<T>(read: ScreenRead<T>, options: Subject): ScreenState<T>;
export function screenState<T, M extends T>(
  read: ScreenRead<T>,
  options: MeasuredOptions<T, M>,
): ScreenState<M>;
export function screenState<T, M extends T>(
  read: ScreenRead<T>,
  options: Subject | MeasuredOptions<T, M>,
): ScreenState<T> {
  if (read.status === 'pending') {
    return { kind: 'state', state: { kind: 'loading', label: `Loading ${options.subject}…` } };
  }
  if (read.status === 'error') {
    return {
      kind: 'state',
      state: {
        kind: 'error',
        title: `Couldn't load ${options.subject}`,
        fallback: 'The request failed or timed out.',
        ...readErrorProps(read),
      },
    };
  }
  if (!('measured' in options) || options.measured(read.data)) {
    return { kind: 'ready', data: read.data };
  }
  return { kind: 'state', state: { kind: 'not_measured', ...options.notMeasured } };
}

/**
 * StateBlock — the loading, empty, filtered-empty, not-measured and error
 * states of a read in one footprint, so a read that
 * goes loading → error → retry → empty never moves the page. The loader is
 * the live rung, shown only after a beat; a failed read replaces it with a
 * Notice and never sits on a placeholder. Callers choose the state, never
 * the geometry.
 */
export function StateBlock(props: StateBlockProps) {
  if (props.kind === 'empty' && props.inline) return <InlineEmptyView {...props} />;
  return (
    <div
      data-state-block={props.kind}
      className={cn(
        'state-block grid min-h-[var(--state-block-height)] min-w-0',
        props.kind === 'error' ? 'content-start' : 'content-center',
      )}
    >
      <BlockBody {...props} />
    </div>
  );
}

function InlineEmptyView({ message, icon: Glyph, action, compact = false }: InlineEmpty) {
  return (
    <div
      data-state-block="empty"
      data-state-block-inline=""
      className={cn(
        textRole('body', 'text-ink-2 flex min-w-0 items-center gap-2'),
        !compact && 'bg-well rounded-control px-3 py-2',
      )}
    >
      {Glyph ? <Glyph className="size-4 shrink-0" aria-hidden /> : null}
      <p className={cn('min-w-0 flex-1', compact && 'truncate')}>{message}</p>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

function FilteredBody({
  heading,
  onClear,
  headingLevel,
  containerLevel,
}: FilteredEmpty & Readonly<{ containerLevel: HeadingLevel }>) {
  return (
    <EmptyBody
      heading={heading ?? 'Nothing matches these filters'}
      description="Change or clear the filters to see every row."
      action={
        <Button variant="secondary" onClick={onClear}>
          Clear filters
        </Button>
      }
      headingLevel={headingLevel ?? containerLevel}
    />
  );
}

function BlockBody(props: Exclude<StateBlockProps, InlineEmpty>) {
  const containerLevel = useContext(StateHeadingLevelContext);
  switch (props.kind) {
    case 'loading':
      return <DelayedLoader label={props.label ?? 'Loading…'} />;
    case 'error':
      return (
        <Notice
          kind="read"
          error={props.error}
          fallback={props.fallback}
          onRetry={props.onRetry}
          pending={props.pending ?? false}
          title={props.title}
        />
      );
    case 'not_measured':
      return (
        <EmptyBody
          // The heading says it in words; the hatched tag only draws it.
          mark={<Absence state="not_measured" aria-hidden />}
          heading="Not measured yet"
          description={props.description}
          action={props.action}
          headingLevel={props.headingLevel ?? containerLevel}
        />
      );
    case 'empty':
      return (
        <EmptyBody
          icon={props.icon}
          heading={props.heading}
          description={props.description}
          action={props.action}
          headingLevel={props.headingLevel ?? containerLevel}
        />
      );
    case 'filtered':
      return <FilteredBody {...props} containerLevel={containerLevel} />;
    default: {
      const exhaustive: never = props;
      return exhaustive;
    }
  }
}

/** Empty, filtered and not-measured share one anatomy: mark, heading, sentence, action. */
function EmptyBody({
  mark,
  icon: Glyph,
  heading,
  description,
  action,
  headingLevel,
}: Readonly<{
  mark?: ReactNode;
  icon?: LucideIcon;
  heading: string;
  description?: string;
  action?: ReactNode;
  headingLevel: HeadingLevel;
}>) {
  const Heading = HEADING_TAG[headingLevel];
  return (
    <div className="max-w-narrow flex flex-col items-start gap-2">
      {mark ?? (Glyph ? <Glyph aria-hidden className="text-ink-2 size-5" /> : null)}
      <Heading className={textRole('heading')}>{heading}</Heading>
      {description ? <p className={textRole('body', 'text-ink-2')}>{description}</p> : null}
      {action ? <div className="flex items-center gap-2 pt-2">{action}</div> : null}
    </div>
  );
}

/**
 * Loaders on screen that have already been revealed. A cold load passes
 * through several owners in turn (shell, route chunk, first read); a loader
 * that mounts while another is showing is the same wait, so it starts revealed.
 */
let revealedLoaders = 0;

/** The live rung and its label, held back a beat (`loading-delayed`) along with its announcement. */
function DelayedLoader({ label }: Readonly<{ label: string }>) {
  const [continued] = useState(() => revealedLoaders > 0);
  const [revealed, setRevealed] = useState(continued);
  useEffect(() => {
    if (!revealed) {
      const timer = setTimeout(() => setRevealed(true), LOADING_INDICATOR_DELAY_MS);
      return () => clearTimeout(timer);
    }
    revealedLoaders += 1;
    return () => {
      revealedLoaders -= 1;
    };
  }, [revealed]);
  return (
    <span className={cn('flex min-h-5 items-center', continued ? undefined : 'loading-delayed')}>
      {revealed ? (
        <output aria-label={label} className="inline-flex items-center gap-2">
          <Spinner />
          <span aria-hidden className={textRole('body', 'text-ink-2')}>
            {label}
          </span>
        </output>
      ) : null}
    </span>
  );
}
