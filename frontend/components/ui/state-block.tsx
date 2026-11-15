import { createContext, useContext, type ReactNode } from 'react';
import { CircleDashed, Inbox, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Notice, readErrorProps, type RetryableRead } from '@/components/ui/notice';
import { RowBlocks, SkeletonFrame } from '@/components/ui/skeleton-block';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

const HEADING_TAG = { 1: 'h1', 2: 'h2', 3: 'h3' } as const;

/** The list rows a loading block draws: three 56px rows sit inside the 200px footprint. */
const LOADING_ROWS = 3;
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
      /** The headline: what failed to load ("Couldn't load the business map"). */
      title: string;
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

/** A failed read's sentence when its error carries none of its own. */
export const READ_FAILED = 'The request failed or timed out.';

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
        fallback: READ_FAILED,
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
 * states of a read in one footprint, so a read that goes loading → error →
 * retry → empty never moves the page. Loading is a card body of `well` row
 * blocks (a region of another shape draws its own `Skeleton`); empty is one block with an icon
 * tile, a headline, one sentence and the one next step; a failed read is a
 * Notice that names what failed, with one Retry. Callers choose the state,
 * never the geometry.
 */
export function StateBlock(props: StateBlockProps) {
  if (props.kind === 'empty' && props.inline) return <InlineEmptyView {...props} />;
  return (
    <div
      data-state-block={props.kind}
      className={cn(
        'state-block grid min-h-[var(--state-block-height)] min-w-0',
        props.kind === 'error' || props.kind === 'loading' ? 'content-start' : 'content-center',
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
      return (
        <SkeletonFrame label={props.label ?? 'Loading…'} variant="block">
          <RowBlocks rows={LOADING_ROWS} />
        </SkeletonFrame>
      );
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
          icon={CircleDashed}
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

/** Empty, filtered and not-measured share one anatomy: icon tile, headline, sentence, action. */
function EmptyBody({
  icon: Glyph = Inbox,
  heading,
  description,
  action,
  headingLevel,
}: Readonly<{
  icon?: LucideIcon;
  heading: string;
  description?: string;
  action?: ReactNode;
  headingLevel: HeadingLevel;
}>) {
  const Heading = HEADING_TAG[headingLevel];
  // One group: the tile 8 over the headline, the sentence 4 under it; the
  // action stands 16 below the group.
  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex flex-col items-start gap-1">
        <span
          aria-hidden
          data-icon-tile=""
          className="bg-well rounded-control text-ink-2 mb-1 grid size-8 place-items-center"
        >
          <Glyph className="size-4" />
        </span>
        <Heading className={textRole('heading')}>{heading}</Heading>
        {description ? (
          <p className={textRole('body', 'text-ink-2 max-w-[72ch]')}>{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
