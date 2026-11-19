import { useContext, useLayoutEffect, useRef, type ReactNode } from 'react';
import { CircleDashed, Inbox, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { usePageEmptyOfferRegister } from '@/components/ui/masthead-actions';
import { Notice, readErrorProps, type RetryableRead } from '@/components/ui/notice';
import { ShapeBlocks, SkeletonFrame, type LoadingShape } from '@/components/ui/skeleton-block';
import { StateHeadingLevelContext, type HeadingLevel } from '@/components/ui/state-heading-level';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

const HEADING_TAG = { 1: 'h1', 2: 'h2', 3: 'h3' } as const satisfies Record<HeadingLevel, string>;

/** Why the block's action is disabled: visible caption text the control names in `aria-describedby`. */
type ActionNote = Readonly<{ id: string; text: string }>;

type BlockEmpty = Readonly<{
  kind: 'empty';
  inline?: false;
  icon?: LucideIcon;
  heading: string;
  /** One sentence: what is missing and what to do about it (a closing sentence may hold a link). */
  description?: ReactNode;
  /**
   * The main action, a Button with no variant of its own (the block draws it
   * primary on the page, secondary inside a card), then at most one
   * supporting `quiet` Button with an icon, or a `TextLink`.
   */
  action?: ReactNode;
  actionNote?: ActionNote;
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
  /** The main action, a Button with no variant of its own (primary on the page, secondary inside a card). */
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
      /** The shape of the page part that loads; give one wherever the block draws (a table draws its own rows). */
      shape?: LoadingShape;
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
  /** The loading shape of what the read fills. */
  shape: LoadingShape;
}>;

type MeasuredOptions<T, M extends T> = Subject &
  Readonly<{
    /** True when the persisted answer holds a measurement; false is "No measurements yet". */
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
    return {
      kind: 'state',
      state: { kind: 'loading', label: `Loading ${options.subject}…`, shape: options.shape },
    };
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
 * states of a read. Its height is its content: it starts at the page's gap
 * and never centres in leftover height. On the page it sits on the surface
 * with no box, padded 24; inside a framed section, slip, table or dialog it
 * steps down to compact spacing (globals.css, `[data-state-frame]`). Loading takes the
 * shape of what loads; empty is one centred group (icon tile, headline,
 * sentence, actions); a failed read is a Notice that names what failed, with
 * one Retry. Callers choose the state, never the geometry or the button look.
 *
 * An empty or not-measured block on the page that offers an action holds the
 * view's one primary: its main action takes the ink fill and the masthead's
 * primary steps down while it shows (globals.css, `MastheadPrimary`).
 */
export function StateBlock(props: StateBlockProps) {
  if (props.kind === 'empty' && props.inline) return <InlineEmptyView {...props} />;
  return <FramedState {...props} />;
}

function FramedState(props: Exclude<StateBlockProps, InlineEmpty>) {
  const ref = useRef<HTMLDivElement>(null);
  usePageOffer(ref, (props.kind === 'empty' || props.kind === 'not_measured') && !!props.action);
  const framed = props.kind !== 'error' && !(props.kind === 'loading' && isFigures(props.shape));
  return (
    <div
      ref={ref}
      data-state-block={props.kind}
      data-state-frame={framed ? '' : undefined}
      className="state-block min-w-0"
    >
      <BlockBody {...props} />
    </div>
  );
}

/** The containers a StateBlock steps down inside (globals.css, `[data-state-frame]`). */
const STATE_CONTAINERS =
  ".surface-card, .surface-slip, .surface-well, [data-section='framed'], [role='dialog'], [data-data-table]";

/**
 * Marks a block on the page that offers an action (`data-state-offer`, its
 * button drawn primary) and registers it with the page while it is mounted.
 */
function usePageOffer(ref: Readonly<{ current: HTMLElement | null }>, offers: boolean) {
  const register = usePageEmptyOfferRegister();
  useLayoutEffect(() => {
    const node = ref.current;
    if (!offers || !node || node.closest(STATE_CONTAINERS)) return;
    node.dataset.stateOffer = '';
    const release = register?.();
    return () => {
      delete node.dataset.stateOffer;
      release?.();
    };
  }, [ref, offers, register]);
}

/** Metric cards are their own frames, so a figures row draws no card around them. */
const isFigures = (shape: LoadingShape | undefined) => shape?.kind === 'figures';

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
      action={<Button onClick={onClear}>Clear filters</Button>}
      headingLevel={headingLevel ?? containerLevel}
    />
  );
}

function BlockBody(props: Exclude<StateBlockProps, InlineEmpty>) {
  const containerLevel = useContext(StateHeadingLevelContext);
  switch (props.kind) {
    case 'loading': {
      const shape = props.shape ?? { kind: 'list' };
      return (
        <SkeletonFrame label={props.label ?? 'Loading…'} variant={shape.kind}>
          <ShapeBlocks shape={shape} />
        </SkeletonFrame>
      );
    }
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
          heading="No measurements yet"
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
          actionNote={props.actionNote}
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
  actionNote,
  headingLevel,
}: Readonly<{
  icon?: LucideIcon;
  heading: string;
  description?: ReactNode;
  action?: ReactNode;
  actionNote?: ActionNote;
  headingLevel: HeadingLevel;
}>) {
  const Heading = HEADING_TAG[headingLevel];
  // The gaps under the tile and above the actions step down inside a container (globals.css).
  return (
    <div className="flex flex-col items-center text-center">
      <span
        aria-hidden
        data-icon-tile=""
        className="bg-well rounded-control text-ink-2 grid size-8 place-items-center"
      >
        <Glyph className="size-4" />
      </span>
      <Heading className={textRole('heading', 'mt-[var(--state-title-gap,16px)] text-balance')}>
        {heading}
      </Heading>
      {description ? (
        <p className={textRole('body', 'text-ink-2 mt-1 max-w-[500px] text-balance')}>
          {description}
        </p>
      ) : null}
      {action ? (
        <div className="mt-[var(--state-action-gap,16px)] flex flex-wrap items-center justify-center gap-2">
          {action}
        </div>
      ) : null}
      {actionNote ? (
        <p id={actionNote.id} className={textRole('caption', 'text-ink-2 mt-2')}>
          {actionNote.text}
        </p>
      ) : null}
    </div>
  );
}
