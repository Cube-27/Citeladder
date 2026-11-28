import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { TextLink } from '@/components/ui/text-link';
import { TEXT_TONE_CLASS, type TextTone } from '@/components/ui/text-role';
import { Tooltip } from '@/components/ui/tooltip';

import { humanizeApiError } from '@/lib/api/errors';
import {
  mutationNoticeForError,
  type MutationNotice as MutationNoticeData,
} from '@/lib/api/mutation-notice';
import { isPlanLimit, PLANS_HREF } from '@/lib/billing/plan-limit';
import { CircleAlert, CircleCheck, Info, TriangleAlert, type IconGlyph } from '@/lib/icons';
import { cn } from '@/lib/utils';

export type NoticeTone = 'info' | 'positive' | 'warning' | 'negative';

export const NOTICE_TONE = {
  info: { glyph: Info, tone: 'info', word: 'Note' },
  positive: { glyph: CircleCheck, tone: 'positive', word: 'Done' },
  warning: { glyph: TriangleAlert, tone: 'warning', word: 'Warning' },
  negative: { glyph: CircleAlert, tone: 'negative', word: 'Error' },
} as const satisfies Record<NoticeTone, { glyph: IconGlyph; tone: TextTone; word: string }>;

type MessageNotice = Readonly<{
  kind?: 'message';
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  standing?: boolean;
  measure?: boolean;
  className?: string;
}>;

type MutationFailure = Readonly<
  {
    kind: 'mutation';
    onRetry?: () => void;
    recovery?: ReactNode;
    className?: string;
  } & ({ notice: MutationNoticeData } | { error: unknown; act: string })
>;

type ReadFailure = Readonly<{
  kind: 'read';
  error: unknown;
  fallback: string;
  onRetry: () => void;
  pending?: boolean;
  title: string;
  className?: string;
}>;

type NoticeProps = MessageNotice | MutationFailure | ReadFailure;

export type RetryableRead = Readonly<{
  error: unknown;
  refetch: () => unknown;
  isFetching: boolean;
}>;

export function readErrorProps(read: RetryableRead) {
  return {
    error: read.error,
    onRetry: () => void read.refetch(),
    pending: read.isFetching,
  };
}

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

const noticeAlign = (action: ReactNode, title: ReactNode) =>
  action && title == null ? 'items-center' : 'items-start';

function MessageNoticeView({
  tone = 'info',
  title,
  children,
  action,
  standing = false,
  measure = false,
  className,
}: MessageNotice) {
  if (children == null && title == null) return null;
  const style = NOTICE_TONE[tone];
  const word = <span className="sr-only">{`${style.word}: `}</span>;
  const urgent = !standing && (tone === 'negative' || tone === 'warning');
  const Root = urgent || standing ? 'div' : 'output';
  return (
    <Root
      role={urgent ? 'alert' : undefined}
      data-notice-tone={tone}
      className={cn(
        'text-body text-ink',
        'flex flex-wrap gap-2',
        noticeAlign(action, title),
        measure && 'max-w-lg',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 basis-60 items-start gap-2">
        <span
          aria-hidden
          className={cn('inline-flex h-5 shrink-0 items-center', TEXT_TONE_CLASS[style.tone])}
        >
          <style.glyph className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          {title != null ? (
            <p className="font-emphasis">
              {word}
              {title}
            </p>
          ) : (
            word
          )}
          {children != null ? <div>{children}</div> : null}
        </div>
      </div>
      <NoticeAction>{action}</NoticeAction>
    </Root>
  );
}

function NoticeAction({ children }: Readonly<{ children: ReactNode }>) {
  if (!children) return null;
  return (
    <div className="phone:ms-6 phone:basis-[calc(100%_-_1.5rem)] phone:justify-start [&_[data-button-variant=quiet]]:text-ink ms-2 flex max-w-full shrink-0 flex-wrap items-center gap-2 self-center">
      {children}
    </div>
  );
}

function failureNotice(props: MutationFailure): MutationNoticeData | null {
  if ('notice' in props) return props.notice;
  return props.error == null ? null : mutationNoticeForError(props.error, { action: props.act });
}

function MutationFailureNotice(props: MutationFailure) {
  const { onRetry, recovery, className } = props;
  const notice = failureNotice(props);
  if (!notice) return null;
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
        <span className="text-caption text-ink-2 block">Support: code {notice.code}</span>
      ) : null}
    </MessageNoticeView>
  );
}

function ReadFailureNotice({ error, fallback, onRetry, pending, title, className }: ReadFailure) {
  const detail = humanizeApiError(error, fallback);
  const accessFailure = detail.status === 401 || detail.status === 403;
  const retryable = detail.retryable !== false && !accessFailure;
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

export function NoticeHeading({ children }: Readonly<{ children: ReactNode }>) {
  return <h1 className="text-heading text-ink">{children}</h1>;
}

export function NoticeFrame({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="p-section grid min-h-[60dvh] place-items-center">{children}</div>;
}
