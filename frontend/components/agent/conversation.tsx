'use client';

import type { ReactNode } from 'react';

import { EvidenceChips } from '@/components/agent/evidence-chips';
import { skillLabel, useSkillCatalog } from '@/components/agent/skill-picker';
import { ProjectLink } from '@/components/layout/scoped-link';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { Disclosure } from '@/components/ui/disclosure';
import { panelClasses } from '@/components/ui/panel';
import { Spinner } from '@/components/ui/spinner';
import { textRole } from '@/components/ui/typography';
import { agentHandoffHref } from '@/lib/agent/handoff';
import { nextStepsFor, refinementsFor } from '@/lib/agent/next-steps';
import { runErrorCopy, runStepLabel } from '@/lib/agent/vocabulary';
import { runOutcome } from '@/lib/agent/run-state';
import type { AgentChatDetail, AgentMessage, AgentRun } from '@/lib/api/agent';
import { ContentMarkdown } from '@/lib/markdown/markdown';
import { cn } from '@/lib/utils';

/**
 * The chat's append-only messages, then the output (rendered in the thread,
 * not beside it), the latest run's state and quick refinements.
 */
export function Conversation({
  detail,
  output: outputView,
  onRefine,
  onRecover,
  hasDraft = false,
  onStop,
  stopping,
  canSend,
  sending = false,
}: Readonly<{
  detail: AgentChatDetail;
  output?: ReactNode;
  onRefine: (instruction: string) => void;
  onRecover: (message: AgentMessage) => void;
  hasDraft?: boolean;
  onStop: () => void;
  stopping: boolean;
  canSend: boolean;
  sending?: boolean;
}>) {
  const skills = useSkillCatalog();
  const outcome = runOutcome(detail.latest_run);
  const output = detail.output;
  return (
    <div className="grid gap-4">
      <ContextUsed context={detail.context} />
      <ol aria-label="Messages" className="grid gap-4">
        {detail.messages.map((message) => (
          <li key={message.id}>
            <MessageBubble message={message} skill={skillLabel(skills, message.skill_id)} />
          </li>
        ))}
      </ol>
      {outputView ? <div className={panelClasses({}, 'min-w-0')}>{outputView}</div> : null}
      <RunState
        outcome={outcome}
        progress={detail.latest_run?.progress ?? []}
        attemptCount={detail.latest_run?.attempt_count}
        onStop={onStop}
        stopping={stopping}
      />
      {(detail.latest_run?.progress.length ?? 0) > 0 ? (
        <RunActivity progress={detail.latest_run!.progress} />
      ) : null}
      {sending ? (
        <output aria-live="polite" className={textRole('caption')}>
          Sending message…
        </output>
      ) : null}
      <TurnRecovery detail={detail} canSend={canSend} onReview={onRecover} hasDraft={hasDraft} />
      {output?.latest_revision && canSend && hasFreshDeliverable(detail) ? (
        <FollowUps
          kind={output.kind}
          title={output.latest_revision.title}
          actionId={detail.chat.action_id}
          outputId={output.id}
          revisionId={output.latest_revision.id}
          onRefine={onRefine}
        />
      ) : null}
    </div>
  );
}

/** Current DTOs expose timestamps, but no revision-to-message link. Be conservative. */
function hasFreshDeliverable(detail: AgentChatDetail): boolean {
  const revision = detail.output?.latest_revision;
  const reply = detail.messages.at(-1);
  return (
    revision?.author === 'agent' &&
    reply?.role === 'agent' &&
    Date.parse(revision.created_at) >= Date.parse(reply.created_at) &&
    detail.latest_run?.status === 'succeeded'
  );
}

function TurnRecovery({
  detail,
  canSend,
  onReview,
  hasDraft,
}: Readonly<{
  detail: AgentChatDetail;
  canSend: boolean;
  onReview: (message: AgentMessage) => void;
  hasDraft: boolean;
}>) {
  const request = [...detail.messages].reverse().find((message) => message.role === 'user');
  if (
    !canSend ||
    !request ||
    !['failed', 'cancelled', 'stopped_at_limit'].includes(runOutcome(detail.latest_run).kind)
  )
    return null;
  return (
    <Button variant="secondary" size="sm" onClick={() => onReview(request)}>
      {hasDraft ? 'Replace draft with failed request' : 'Review request to try again'}
    </Button>
  );
}

function MessageBubble({
  message,
  skill,
}: Readonly<{ message: AgentMessage; skill: string | null }>) {
  if (message.event?.kind === 'outline_approved')
    return (
      <article
        aria-label="Outline approval"
        className={panelClasses({ tone: 'well', pad: 'compact' }, 'grid gap-1')}
      >
        <span className={textRole('label')}>Outline approved</span>
        <p className={textRole('caption')}>Draft requested from the approved revision.</p>
      </article>
    );
  if (message.role === 'user')
    return (
      <div className="flex justify-end">
        <div className={panelClasses({ tone: 'well', pad: 'compact' }, 'grid max-w-[85%] gap-2')}>
          <p className={textRole('body', 'whitespace-pre-wrap')}>{message.content}</p>
          {message.mentions.length > 0 ? (
            <ul aria-label="Mentioned Actions" className="flex flex-wrap gap-2">
              {message.mentions.map((mention) => (
                <li key={mention.id}>
                  <ProjectLink
                    href={`/agent/actions/${mention.id}`}
                    className={textRole('caption', 'hover:text-accent-text underline')}
                  >
                    @{mention.label}
                  </ProjectLink>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    );
  const tools = message.steps.filter((step) => step.kind === 'tool').length;
  const readsLabel = tools === 1 ? 'read' : 'reads';
  return (
    <article aria-label="Agent reply" className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={textRole('label')}>Agent</span>
        {skill ? <span className={textRole('caption')}>Skill: {skill}</span> : null}
      </div>
      <ContentMarkdown markdown={message.content} density="compact" />
      <div className="flex flex-wrap items-center gap-2">
        <EvidenceChips refs={message.evidence_refs} />
        <CopyButton value={message.content} size="sm" variant="ghost">
          Copy reply
        </CopyButton>
      </div>
      {message.steps.length > 0 ? (
        <details className="group">
          <summary className={textRole('caption', 'cursor-pointer')}>
            Run complete · {message.steps.length} {message.steps.length === 1 ? 'step' : 'steps'}
            {tools > 0 ? ` · ${tools} data ${readsLabel}` : ''}
          </summary>
          <ul className="grid gap-1 ps-4 pt-2">
            {message.steps.map((step, index) => (
              <li key={`${step.kind}-${index}`} className={textRole('caption')}>
                {stepLabel(step)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}
function ContextUsed({ context }: Readonly<{ context: AgentChatDetail['context'] }>) {
  const prompt = context.prompt ?? {};
  const included = Array.isArray(prompt.included_sections) ? prompt.included_sections : [];
  const omissions = [
    ...(context.limitations ?? []),
    ...(Array.isArray(prompt.omissions) ? prompt.omissions : []),
  ];
  const labels: Record<string, string> = {
    brand: 'Reviewed business context',
    target_page: 'Target page',
    related_site: 'Related pages',
    opportunity: 'Recommendation',
    demand: 'Demand evidence',
    site_health: 'Page diagnosis',
    search_intelligence: 'Selected Search Intelligence rows',
    issue_group: 'Selected issue group',
    site_facts: 'Selected crawl robots policy',
    upstream_revision: 'Selected document revision',
  };
  if (!Object.keys(context).length) return null;
  return (
    <Disclosure title="Context used">
      <div className="grid gap-2">
        <p className={textRole('caption')}>
          {included.length
            ? included.map((section) => labels[String(section)] ?? String(section)).join(' · ')
            : 'No model context has been supplied yet.'}
        </p>
        {context.instructions ? (
          <p className={textRole('caption')}>
            Project instructions · revision {context.instructions.revision}
          </p>
        ) : null}
        {context.action ? (
          <p className={textRole('caption')}>Action: {context.action.label}</p>
        ) : null}
        {(context.sources?.length ?? 0) > 0 ? (
          <p className={textRole('caption')}>
            {context.sources!.length} persisted page source references
          </p>
        ) : null}
        <ContextSources context={context} />
        {typeof prompt.serialized_chars === 'number' ? (
          <p className={textRole('caption')}>
            Working context: {prompt.serialized_chars.toLocaleString()} of{' '}
            {Number(prompt.max_chars).toLocaleString()} characters
          </p>
        ) : null}
        {omissions.length > 0 ? (
          <ul aria-label="Context limitations" className="grid gap-1">
            {omissions.map((omission, index) => (
              <li key={index} className={textRole('caption')}>
                {omissionLabel(omission)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Disclosure>
  );
}
function ContextSources({ context }: Readonly<{ context: AgentChatDetail['context'] }>) {
  const references = Object.entries(context.refs ?? {});
  if (!references.length && !context.sources?.length) return null;
  return (
    <details>
      <summary className={textRole('caption', 'cursor-pointer')}>Source identities</summary>
      <ul aria-label="Context source identities" className="grid gap-2 pt-2">
        {references.map(([key, value]) => (
          <li key={key} className={textRole('caption', 'break-all')}>
            {key.replaceAll('_', ' ')}: {JSON.stringify(value)}
          </li>
        ))}
        {(context.sources ?? []).map((source, index) => (
          <li key={index} className={textRole('caption', 'break-all')}>
            Persisted page source: {JSON.stringify(source)}
          </li>
        ))}
      </ul>
    </details>
  );
}
function omissionLabel(omission: unknown) {
  return typeof omission === 'string' ? omission.replaceAll('_', ' ') : JSON.stringify(omission);
}

/**
 * After a deliverable: refinements revise it in this chat; next steps start a
 * new chat with the skill that takes the work forward.
 */
function FollowUps({
  kind,
  title,
  actionId,
  outputId,
  revisionId,
  onRefine,
}: Readonly<{
  kind: string;
  title: string;
  actionId: string | null;
  outputId: string;
  revisionId: string;
  onRefine: (instruction: string) => void;
}>) {
  const next = nextStepsFor(kind, title);
  return (
    <div className="grid gap-3">
      <fieldset aria-label="Suggested follow-ups" className="flex flex-wrap gap-2">
        <legend className={textRole('caption')}>Add a suggestion to your message:</legend>
        {refinementsFor(kind).map((instruction) => (
          <Button
            key={instruction}
            variant="secondary"
            size="sm"
            onClick={() => onRefine(instruction)}
          >
            {instruction}
          </Button>
        ))}
      </fieldset>
      {next.length > 0 ? (
        <nav aria-label="Next steps" className="flex flex-wrap items-center gap-2">
          <span className={textRole('caption')}>Next, in a new chat:</span>
          {next.map((step) => (
            <Button key={step.label} asChild variant="ghost" size="sm">
              <ProjectLink
                href={agentHandoffHref({
                  actionId,
                  prompt: step.prompt,
                  skillId: step.skillId,
                  outputRevision: { outputId, revisionId },
                })}
              >
                {step.label}
              </ProjectLink>
            </Button>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

function stepLabel(step: AgentMessage['steps'][number]): string {
  if (step.kind === 'skill') return 'Chose a skill';
  if (step.kind === 'tool')
    return runStepLabel({ tool: step.tool ?? 'read_data', status: step.status ?? 'unknown' });
  return 'Worked on the reply';
}

function RunState({
  outcome,
  progress,
  attemptCount,
  onStop,
  stopping,
}: Readonly<{
  outcome: ReturnType<typeof runOutcome>;
  progress: AgentRun['progress'];
  attemptCount: number | undefined;
  onStop: () => void;
  stopping: boolean;
}>) {
  switch (outcome.kind) {
    case 'running':
      return (
        <div className={cn('grid gap-2', textRole('body'))}>
          <span className="flex items-center gap-3">
            <Spinner className="text-muted" />
            <output aria-live="polite" className="flex-1">
              {outcome.queued ? 'Waiting to start…' : activeStepLabel(progress, attemptCount)}
            </output>
            <Button variant="ghost" size="sm" disabled={stopping} onClick={onStop}>
              Stop
            </Button>
          </span>
        </div>
      );
    case 'stopped_at_limit':
      return <Alert tone="warning">{runErrorCopy('stopped_at_limit')}</Alert>;
    case 'failed':
      return <Alert tone="danger">{runErrorCopy(outcome.code)}</Alert>;
    case 'cancelled':
      return <p className={textRole('caption')}>Stopped. Nothing from this turn was saved.</p>;
    default:
      return null;
  }
}
function activeStepLabel(progress: AgentRun['progress'], attemptCount: number | undefined) {
  const currentAttempt = attemptCount ?? progress.at(-1)?.run_attempt;
  const current = progress.filter((step) => step.run_attempt === currentAttempt).at(-1);
  return current ? runStepLabel(current) : 'The agent is working…';
}
function RunActivity({ progress }: Readonly<{ progress: AgentRun['progress'] }>) {
  return (
    <details>
      <summary className={textRole('caption', 'cursor-pointer')}>View activity</summary>
      <ol aria-label="Agent progress" className="grid gap-1 ps-4 pt-2">
        {progress.map((step) => (
          <li key={`${step.run_attempt}:${step.ordinal}`} className={textRole('caption')}>
            Attempt {step.run_attempt} · Step {step.ordinal} · {runStepLabel(step)}
          </li>
        ))}
      </ol>
    </details>
  );
}
