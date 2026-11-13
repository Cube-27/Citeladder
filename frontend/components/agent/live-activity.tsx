import { useEffect, useState } from 'react';

import { LiveReply } from '@/components/agent/live-reply';
import { Callout } from '@/components/ui/callout';
import { AgentTurn } from '@/components/ui/chat-dock';
import { ChainOfThoughtLive, ChainOfThoughtStep } from '@/components/ui/chain-of-thought';
import { Inline } from '@/components/ui/layout';
import { Spinner } from '@/components/ui/spinner';
import { textRole } from '@/components/ui/typography';
import { activityLabel, activityRows, callStep, modelStepLabel } from '@/lib/agent/activity';
import { runErrorCopy } from '@/lib/agent/vocabulary';
import { isPageReading, runOutcome } from '@/lib/agent/run-state';
import { useLiveTurn, type LiveTurn } from '@/lib/agent/live-turns';
import type { AgentChatDetail, AgentRun } from '@/lib/api/agent';

/**
 * The running turn, or how an unanswered one ended. Its live events are
 * subscribed here, not in the conversation, so each streamed delta re-renders
 * only this turn, never the earlier messages.
 */
export function LiveActivity({ detail }: Readonly<{ detail: AgentChatDetail }>) {
  const outcome = runOutcome(detail.latest_run);
  const live = useLiveTurn(outcome.kind === 'running' ? outcome.run.id : null);
  const answered = detail.messages.at(-1)?.role === 'agent';
  if (isPageReading(detail.page_fetch)) return <ReadingPage />;
  switch (outcome.kind) {
    case 'running':
      return <RunningTurn run={outcome.run} queued={outcome.queued} live={live} />;
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
/**
 * The turn as it runs: its status line first, then what it has written. The
 * status line keeps one height from start to end and the written text only
 * grows at its end, so the streaming text never moves.
 */
function RunningTurn({
  run,
  queued,
  live,
}: Readonly<{ run: AgentRun; queued: boolean; live: LiveTurn | undefined }>) {
  const status =
    queued && !live?.step
      ? 'Waiting to start…'
      : (liveStepLabel(live) ?? activeStepLabel(run.progress, run.attempt_count));
  // The stream is the freshest record while it lasts; after it drops the run is
  // polled. The longer record wins, so rows never vanish at the switch.
  const streamed = activityRows((live?.tools ?? []).map(callStep));
  const polled = activityRows(run.progress.map(callStep));
  const rows = streamed.length >= polled.length ? streamed : polled;
  const seconds = useElapsedSeconds(live?.startedAt ?? Date.parse(run.created_at));
  return (
    <AgentTurn inProgress>
      <ChainOfThoughtLive status={status} seconds={seconds} label="Agent activity">
        {rows.length > 0 ? (
          rows.map((row) => (
            <ChainOfThoughtStep
              key={row.key}
              label={activityLabel(row)}
              detail={row.detail}
              status={row.state}
            />
          ))
        ) : (
          <li className={textRole('caption')}>Nothing read yet.</li>
        )}
      </ChainOfThoughtLive>
      <LiveReply live={live} />
    </AgentTurn>
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
function useElapsedSeconds(since: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.round((now - since) / 1000));
}
function activeStepLabel(progress: AgentRun['progress'], attemptCount: number | undefined) {
  const currentAttempt = attemptCount ?? progress.at(-1)?.run_attempt;
  const current = [...progress].reverse().find((step) => step.run_attempt === currentAttempt);
  if (!current) return 'The agent is working…';
  if (current.tool === null) return modelStepLabel(current.status);
  const [row] = activityRows([callStep(current)]);
  return row ? activityLabel(row) : modelStepLabel('working');
}
