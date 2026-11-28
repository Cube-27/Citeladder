import {
  Children,
  Fragment,
  isValidElement,
  useContext,
  useLayoutEffect,
  type ReactNode,
} from 'react';

import { Button, ButtonEmphasis, PROMOTE } from '@/components/ui/button';
import { usePageEmptyOfferRegister } from '@/components/ui/masthead-actions';
import { Notice, readErrorProps, type RetryableRead } from '@/components/ui/notice';
import { Section, useOnPage } from '@/components/ui/section';
import { ShapeBlocks, SkeletonFrame, type LoadingShape } from '@/components/ui/skeleton-block';
import { StateHeadingLevelContext, type HeadingLevel } from '@/components/ui/state-heading-level';

import { CircleDashed, Inbox, type IconGlyph } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';

const HEADING_TAG = { 1: 'h1', 2: 'h2', 3: 'h3' } as const satisfies Record<HeadingLevel, string>;

type ActionNote = Readonly<{ id: string; text: string }>;

type BlockEmpty = Readonly<{
  kind: 'empty';
  inline?: false;
  icon?: IconGlyph;
  heading: string;
  description?: ReactNode;
  action?: ReactNode;
  actionNote?: ActionNote;
  headingLevel?: HeadingLevel;
}>;

type InlineEmpty = Readonly<{
  kind: 'empty';
  inline: true;
  message: ReactNode;
  icon?: IconGlyph;
  action?: ReactNode;
  compact?: boolean;
}>;

type FilteredEmpty = Readonly<{
  kind: 'filtered';
  heading?: string;
  onClear: () => void;
  headingLevel?: HeadingLevel;
}>;

type NotMeasuredCopy = Readonly<{
  description: string;
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
      label?: string;
      shape?: LoadingShape;
    }>
  | Readonly<{
      kind: 'error';
      error: unknown;
      fallback: string;
      onRetry: () => void;
      pending?: boolean;
      title: string;
    }>
  | NotMeasured
  | BlockEmpty
  | FilteredEmpty
  | InlineEmpty;

type ScreenRead<T> = RetryableRead &
  (
    | Readonly<{ status: 'pending' }>
    | Readonly<{ status: 'error' }>
    | Readonly<{ status: 'success'; data: T }>
  );

type ScreenState<M> =
  | Readonly<{ kind: 'ready'; data: M }>
  | Readonly<{ kind: 'state'; state: StateBlockProps }>;

export const READ_FAILED = 'The request failed or timed out.';

type Subject = Readonly<{
  subject: string;
  shape: LoadingShape;
}>;

type MeasuredOptions<T, M extends T> = Subject &
  Readonly<{
    hasMeasurement: (data: T) => data is M;
    notMeasured: NotMeasuredCopy;
  }>;

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
  if (!('hasMeasurement' in options) || options.hasMeasurement(read.data)) {
    return { kind: 'ready', data: read.data };
  }
  return { kind: 'state', state: { kind: 'not_measured', ...options.notMeasured } };
}

export type TableRead<T> = RetryableRead &
  Readonly<{
    isError: boolean;
    data: T | undefined;
  }>;

export type RefreshError = Readonly<{
  error: unknown;
  fallback: string;
  onRetry: () => void;
  pending?: boolean;
  title: string;
}>;

type TableState = Exclude<StateBlockProps, { inline: true }>;

export type QueryTableState<S extends StateBlockProps = TableState> = Readonly<{
  state?: S | TableState;
  refreshError?: RefreshError;
}>;

export function queryTableState<T, S extends StateBlockProps = TableState>(
  read: TableRead<T>,
  {
    subject,
    loading = `Loading ${subject}…`,
    empty,
  }: Readonly<{
    subject: string;
    loading?: string;
    empty?: (data: T) => S | undefined;
  }>,
): QueryTableState<S> {
  const failure = read.isError
    ? { title: `Couldn't load ${subject}`, fallback: READ_FAILED, ...readErrorProps(read) }
    : undefined;
  if (read.data === undefined) {
    if (failure) return { state: { kind: 'error', ...failure } };
    return { state: { kind: 'loading', label: loading } };
  }
  return { state: empty?.(read.data), refreshError: failure };
}

export function StateBlock(props: StateBlockProps) {
  const onPage = useOnPage();
  const level = useContext(StateHeadingLevelContext);
  const block =
    props.kind === 'empty' && props.inline ? (
      <InlineEmptyView {...props} />
    ) : (
      <FramedState {...props} onPage={onPage} />
    );
  if (!onPage || !framedKind(props)) return block;
  return (
    <Section>
      <StateHeadingLevelContext value={level}>{block}</StateHeadingLevelContext>
    </Section>
  );
}

const framedKind = (props: StateBlockProps) =>
  props.kind !== 'error' && !(props.kind === 'loading' && isFigures(props.shape));

function FramedState({
  onPage,
  ...props
}: Exclude<StateBlockProps, InlineEmpty> & Readonly<{ onPage: boolean }>) {
  const offers =
    onPage && (props.kind === 'empty' || props.kind === 'not_measured') && !!props.action;
  const register = usePageEmptyOfferRegister();
  useLayoutEffect(() => {
    if (!offers) return;
    return register?.();
  }, [offers, register]);
  const framed = framedKind(props);
  return (
    <div
      data-state-block={props.kind}
      data-state-frame={framed ? '' : undefined}
      className="min-w-0"
    >
      <BlockBody {...props} offers={offers} />
    </div>
  );
}

const isFigures = (shape: LoadingShape | undefined) => shape?.kind === 'figures';

function InlineEmptyView({ message, icon: Glyph, action, compact = false }: InlineEmpty) {
  return (
    <div
      data-state-block="empty"
      data-state-block-inline=""
      className={cn('text-body text-ink-2 flex min-w-0 items-center gap-2')}
    >
      {Glyph ? <Icon icon={Glyph} size="flush" /> : null}
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
      action={<Button onClick={onClear}>Clear filters</Button>}
      headingLevel={headingLevel ?? containerLevel}
    />
  );
}

function BlockBody({
  offers,
  ...props
}: Exclude<StateBlockProps, InlineEmpty> & Readonly<{ offers: boolean }>) {
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
          pending={props.pending}
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
          offers={offers}
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
          offers={offers}
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

function EmptyBody({
  icon: Glyph = Inbox,
  heading,
  description,
  action,
  offers,
  actionNote,
  headingLevel,
}: Readonly<{
  icon?: IconGlyph;
  heading: string;
  description?: ReactNode;
  action?: ReactNode;
  offers?: boolean;
  actionNote?: ActionNote;
  headingLevel: HeadingLevel;
}>) {
  const Heading = HEADING_TAG[headingLevel];
  const group = isValidElement<{ children?: ReactNode }>(action) && action.type === Fragment;
  const [lead, ...rest] = Children.toArray(group ? action.props.children : action);
  return (
    <div className="flex flex-col items-center text-center">
      <span aria-hidden data-icon-tile="" className="text-ink-2">
        <Glyph className="size-4" />
      </span>
      <Heading className="text-label text-ink mt-[var(--state-title-gap,var(--spacing-loose))] text-balance">
        {heading}
      </Heading>
      {description ? (
        <p className="text-body text-ink-2 mt-1 max-w-125 text-balance">{description}</p>
      ) : null}
      {action ? (
        <div className="mt-[var(--state-action-gap,var(--spacing-loose))] flex flex-wrap items-center justify-center gap-2">
          <ButtonEmphasis value={offers ? PROMOTE : null}>{lead}</ButtonEmphasis>
          {rest}
        </div>
      ) : null}
      {actionNote ? (
        <p id={actionNote.id} className="text-caption text-ink-2 mt-2">
          {actionNote.text}
        </p>
      ) : null}
    </div>
  );
}
