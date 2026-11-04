import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { TextLink } from '@/components/ui/text-link';
import type { MutationNotice as MutationNoticeData } from '@/lib/api/mutation-notice';
import { isPlanLimit, PLANS_HREF } from '@/lib/billing/plan-limit';

/**
 * The shared mutation-failure notice (A4/A6): a negative Callout.
 *
 * Renders the A4 policy copy (`mutationNoticeForError`): the backend message
 * verbatim for 4xx preconditions, transient "try again" copy for
 * 5xx/network/timeout failures. When the failure is retryable and `onRetry`
 * is given, Try again is the callout's action. The support line always
 * surfaces the machine `code` / `X-Request-ID` when the API sent them, so a
 * user report maps straight to backend logs (A6). A refusal a bigger plan can
 * lift links to billing.
 */
export function MutationNotice({
  notice,
  onRetry,
  className,
}: Readonly<{
  notice: MutationNoticeData;
  /** Retry affordance — rendered only when the failure is transient. */
  onRetry?: () => void;
  className?: string;
}>) {
  const correlation = [
    notice.code ? `code ${notice.code}` : null,
    notice.requestId ? `ref ${notice.requestId}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  let action = null;
  if (notice.retryable && onRetry)
    action = (
      <Button type="button" onClick={onRetry}>
        Try again
      </Button>
    );
  else if (isPlanLimit(notice.code)) action = <TextLink href={PLANS_HREF}>See plans</TextLink>;
  return (
    <Callout tone="negative" className={className} action={action}>
      <span className="block">{notice.message}</span>
      {correlation ? (
        <span className="text-ink-secondary text-caption block">Support: {correlation}</span>
      ) : null}
    </Callout>
  );
}
