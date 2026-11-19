import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Icon } from '@/components/ui/icon';
import { TextLink } from '@/components/ui/text-link';
import { Tooltip } from '@/components/ui/tooltip';
import { textRole } from '@/components/ui/typography';
import { humanizeApiError } from '@/lib/api/errors';
import type { MutationNotice as MutationNoticeData } from '@/lib/api/mutation-notice';
import { isPlanLimit, PLANS_HREF } from '@/lib/billing/plan-limit';
import { cn } from '@/lib/utils';

export type NoticeTone = 'info' | 'positive' | 'warning' | 'negative';

/** Each tone's wash, glyph ink, glyph and the word a screen reader hears first. */
const TONE: Record<NoticeTone, { wash: string; ink: string; icon: LucideIcon; word: string }> = {
  info: { wash: 'bg-info-wash', ink: 'text-info', icon: Info, word: 'Note' },
  positive: { wash: 'bg-positive-wash', ink: 'text-positive', icon: CircleCheck, word: 'Done' },
  warning: { wash: 'bg-warning-wash', ink: 'text-warning', icon: TriangleAlert, word: 'Warning' },
  negative: { wash: 'bg-negative-wash', ink: 'text-negative', icon: CircleAlert, word: 'Error' },
};

type MessageNotice = Readonly<{
  kind?: 'message';
  tone?: NoticeTone;
  title?: ReactNode;
  /** One or two sentences: what is true, then what to do. */
  children?: ReactNode;
  /** One secondary Button or a TextLink. */
  action?: ReactNode;
  /** Overrides the tone's glyph. */
  icon?: LucideIcon;
  /**
   * A standing caveat on the page (a warning beside a destructive control),
   * not news: it is read in place and never announced as an alert.
   */
  standing?: boolean;
  className?: string;
}>;

/** A failed write, from `mutationNoticeForError`. */
type MutationFailure = Readonly<{
  kind: 'mutation';
  notice: MutationNoticeData;
  /** Rendered only when the failure is transient. */
  onRetry?: () => void;
  /** The step that recovers this failure; replaces Try again when given. */
  recovery?: ReactNode;
  className?: string;
}>;

/** A failed persisted read: Retry re-runs exactly that read. */
type ReadFailure = Readonly<{
  kind: 'read';
  error: unknown;
  fallback: string;
  onRetry: () => void;
  pending?: boolean;
  /** The headline: what failed to load ("Couldn't load the business map"). */
  title: string;
  className?: string;
}>;

export type NoticeProps = MessageNotice | MutationFailure | ReadFailure;

/** The read a failure notice reports on and retries: a TanStack query, or its shape. */
export type RetryableRead = Readonly<{
  error: unknown;
  refetch: () => unknown;
  isFetching: boolean;
}>;

/** A read failure Notice's props from one query. */
export function readErrorProps(read: RetryableRead) {
  return {
    error: read.error,
    onRetry: () => void read.refetch(),
    pending: read.isFetching,
  };
}

/**
 * Notice — the app's one inline message (`Callout` is the website's): the tone's glyph, a
 * sentence and at most one action, on the tone's wash with the control
 * radius. Failures of a write (`kind="mutation"`) and of a read
 * (`kind="read"`) are notices too, so a failure renders one way everywhere;
 * both offer to copy the support reference when the API sent one. Negative and
 * warning notices are alerts, the rest a polite status.
 */
export function Notice(props: NoticeProps) {
  switch (props.kind) {
    case 'mutation':
      return <MutationFailureNotice {...props} />;
    case 'read':
      return <ReadFailureNotice {...props} />;
    case undefined:
    case 'message':
      return <MessageNoticeView {...props} />;
    default: {
      const unreachable: never = props;
      return unreachable;
    }
  }
}

function MessageNoticeView({
  tone = 'info',
  title,
  children,
  action,
  icon,
  standing = false,
  className,
}: MessageNotice) {
  if (children == null && title == null) return null;
  const style = TONE[tone];
  const word = <span className="sr-only">{`${style.word}: `}</span>;
  const urgent = !standing && (tone === 'negative' || tone === 'warning');
  const Root = urgent || standing ? 'div' : 'output';
  return (
    <Root
      role={urgent ? 'alert' : undefined}
      data-notice-tone={tone}
      className={cn(
        textRole('body'),
        // Actions that do not fit beside the text wrap under it, at the right;
        // below 768 they sit under the message, on its left edge.
        'rounded-control flex flex-wrap items-start gap-2 px-3 py-2',
        style.wash,
        className,
      )}
    >
      <span aria-hidden className={cn('inline-flex h-5 shrink-0 items-center', style.ink)}>
        <Icon icon={icon ?? style.icon} className="my-0" />
      </span>
      <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-1">
        {title != null ? (
          <p className="type-emphasis">
            {word}
            {title}
          </p>
        ) : (
          word
        )}
        {children != null ? <div>{children}</div> : null}
      </div>
      {action ? (
        <div className="phone:ms-6 phone:basis-[calc(100%-1.5rem)] phone:justify-start ms-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2 self-center">
          {action}
        </div>
      ) : null}
    </Root>
  );
}

function MutationFailureNotice({ notice, onRetry, recovery, className }: MutationFailure) {
  let action: ReactNode = recovery ?? null;
  if (action === null && notice.retryable && onRetry)
    action = (
      <Button type="button" variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    );
  else if (action === null && isPlanLimit(notice.code))
    action = <TextLink href={PLANS_HREF}>See plans</TextLink>;
  return (
    <MessageNoticeView
      tone="negative"
      className={className}
      action={withReference(action, notice.requestId)}
    >
      <span className="block">{notice.message}</span>
      {notice.code ? (
        <span className={textRole('caption', 'block')}>Support: code {notice.code}</span>
      ) : null}
    </MessageNoticeView>
  );
}

/**
 * The headline names what failed ("Couldn't load runs"); a server's words
 * never are. A sentence a person can act on follows it; a server fault shows
 * the notice's own fallback, never its status text.
 */
function ReadFailureNotice({ error, fallback, onRetry, pending, title, className }: ReadFailure) {
  const detail = humanizeApiError(error, fallback);
  const accessFailure = detail.status === 401 || detail.status === 403;
  const retryable = detail.retryable !== false && !accessFailure;
  // The failure's own words when a person wrote them, the fallback for a
  // server fault ("Internal Server Error" is never shown); words repeating the headline drop.
  const said = (detail.status ?? 0) >= 500 ? fallback : detail.message;
  const sentence = said.replace(/\.$/u, '') === title ? null : said;
  const action = retryable ? (
    <Button variant="secondary" onClick={onRetry} pending={pending} pendingLabel="Retrying…">
      Retry
    </Button>
  ) : null;
  let next: string | null = null;
  if (accessFailure) next = 'Check your workspace access, then try again.';
  else if (retryable && !sentence) next = 'Retry in a moment.';
  return (
    <MessageNoticeView
      tone="negative"
      title={title}
      action={withReference(action, detail.requestId)}
      className={className}
    >
      {sentence ? <p>{sentence}</p> : null}
      {next ? <p>{next}</p> : null}
    </MessageNoticeView>
  );
}

/** The failure's actions, then the support reference as a quiet copy control. */
function withReference(action: ReactNode, requestId: string | undefined): ReactNode {
  if (!requestId) return action;
  return (
    <>
      {action}
      <Tooltip content={<span className="whitespace-nowrap">{requestId}</span>}>
        <CopyButton variant="quiet" value={requestId}>
          Copy reference
        </CopyButton>
      </Tooltip>
    </>
  );
}
