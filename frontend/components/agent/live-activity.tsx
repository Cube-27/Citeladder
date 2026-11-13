import { useEffect, useState } from 'react';

import { ActivityChain } from '@/components/agent/activity-chain';
import { LiveReply } from '@/components/agent/live-reply';
import { Callout } from '@/components/ui/callout';
import { ChainOfThoughtStep } from '@/components/ui/chain-of-thought';
import { Inline, Stack } from '@/components/ui/layout';
import { Spinner } from '@/components/ui/spinner';
import { textRole } from '@/components/ui/typography';
import { treeBranchClasses } from '@/components/ui/workspace';
import { activityLabel, activityRows, callStep, modelStepLabel } from '@/lib/agent/activity';
import { runErrorCopy } from '@/lib/agent/vocabulary';
import { isPageReading, runOutcome } from '@/lib/agent/run-state';
import { useLiveTurn, type LiveTurn } from '@/lib/agent/live-turns';
import type { AgentChatDetail, AgentRun } from '@/lib/api/agent';

/**
 * The running turn's live events. Subscribed here, not in the conversation, so
 * each streamed delta re-renders only this activity, never the earlier messages.
 */
export function LiveActivity({ detail }: Readonly<{ detail: AgentChatDetail }>) {
  const outcome = runOutcome(detail.latest_run);
  const live = useLiveTurn(outcome.kind === 'running' ? outcome.run.id : null);
  return (
    <>
      <LiveReply live={live} />
      <RunState detail={detail} live={live} />
    </>
  );
}

function RunState({
  detail,
  live,
}: Readonly<{ detail: AgentChatDetail; live: LiveTurn | undefined }>) {
  const outcome = runOutcome(detail.latest_run);
  const answered = detail.messages.at(-1)?.role === 'agent';
  if (isPageReading(detail.page_fetch)) return <ReadingPage />;
  switch (outcome.kind) {
    case 'running':
      return <RunningState run={outcome.run} queued={outcome.queued} live={live} />;
    // Every ended turn now answers with its own reply; older ones may not have.
    case 'stopped_at_limit':
      return answered ? null : <Callout tone="warning">{runErrorCopy('stopped_at_limit')}</Callout>;
    case 'failed':
      return answered ? null : <Callout tone="negative">{runErrorCopy(outcome.code)}</Callout>;
    default:
      return null;
  }
}
/** A page chat's fetch: the first turn starts once the page is read. */
function ReadingPage() {
  return (
    <Inline as="span" gap="compact" className={textRole('caption')}>
      <Spinner className="text-ink-muted" />
      <output aria-live="polite">Reading your page…</output>
    </Inline>
  );
}
function RunningState({
  run,
  queued,
  live,
}: Readonly<{ run: AgentRun; queued: boolean; live: LiveTurn | undefined }>) {
  const label =
    queued && !live?.step
      ? 'Waiting to start…'
      : (liveStepLabel(live) ?? activeStepLabel(run.progress, run.attempt_count));
  // The current model call's tool calls run at the same time.
  const current = activityRows(
    (live?.tools.filter((tool) => tool.ordinal === live.step) ?? []).map(callStep),
  );
  // An open stream is the freshest record of the turn; without one the run is polled.
  const done = activityRows(
    live?.connected ? live.tools.map(callStep) : run.progress.map(callStep),
  );
  return (
    <Stack gap="compact">
      <Inline as="span" gap="compact" className={textRole('caption')}>
        <Spinner className="text-ink-muted" />
        {/* Only the step is announced; the seconds tick outside the live region. */}
        <span className="flex-1">
          <output aria-live="polite">{label}</output>
          <Elapsed since={live?.startedAt ?? Date.parse(run.created_at)} />
        </span>
      </Inline>
      {current.length > 1 ? (
        <Stack as="ul" gap="tight" aria-label="Current reads" className={treeBranchClasses()}>
          {current.map((row) => (
            <ChainOfThoughtStep
              key={row.key}
              label={activityLabel(row)}
              detail={row.detail}
              status={row.state}
            />
          ))}
        </Stack>
      ) : null}
      <ActivityChain rows={done} />
    </Stack>
  );
}
/** What the newest model call is doing: its running reads, else deciding. */
function liveStepLabel(live: LiveTurn | undefined) {
  if (!live?.step) return null;
  const running = activityRows(
    live.tools.filter((tool) => tool.ordinal === live.step).map(callStep),
  ).filter((row) => row.state === 'running');
  if (running.length > 1) return `Running ${running.length} reads at once…`;
  if (running[0]) return `${activityLabel(running[0])}…`;
  return modelStepLabel('working');
}
function Elapsed({ since }: Readonly<{ since: number }>) {
  const now = useNow(1000);
  const seconds = Math.max(0, Math.round((now - since) / 1000));
  return seconds >= 3 ? <span className="text-ink-muted"> · {seconds}s</span> : null;
}
function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
function activeStepLabel(progress: AgentRun['progress'], attemptCount: number | undefined) {
  const currentAttempt = attemptCount ?? progress.at(-1)?.run_attempt;
  const current = [...progress].reverse().find((step) => step.run_attempt === currentAttempt);
  if (!current) return 'The agent is working…';
  if (current.tool === null) return modelStepLabel(current.status);
  const [row] = activityRows([callStep(current)]);
  return row ? activityLabel(row) : modelStepLabel('working');
}
