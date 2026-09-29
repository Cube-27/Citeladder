'use client';

import type { ReactNode } from 'react';

import { EvidenceChips } from '@/components/agent/evidence-chips';
import { skillLabel, useSkillCatalog } from '@/components/agent/skill-picker';
import { ProjectLink } from '@/components/layout/scoped-link';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
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
  onStop,
  stopping,
  canSend,
}: Readonly<{
  detail: AgentChatDetail;
  output?: ReactNode;
  onRefine: (instruction: string) => void;
  onStop: () => void;
  stopping: boolean;
  canSend: boolean;
}>) {
  const skills = useSkillCatalog();
  const outcome = runOutcome(detail.latest_run);
  const output = detail.output;
  return (
    <div className="grid gap-4">
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
        onStop={onStop}
        stopping={stopping}
      />
      {output?.latest_revision && canSend && outcome.kind !== 'running' ? (
        <FollowUps
          kind={output.kind}
          title={output.latest_revision.title}
          actionId={detail.chat.action_id}
          onRefine={onRefine}
        />
      ) : null}
    </div>
  );
}

function MessageBubble({
  message,
  skill,
}: Readonly<{ message: AgentMessage; skill: string | null }>) {
  if (message.role === 'user')
    return (
      <div className="flex justify-end">
        <div className={panelClasses({ tone: 'well', pad: 'compact' }, 'max-w-[85%]')}>
          <p className={textRole('body', 'whitespace-pre-wrap')}>{message.content}</p>
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

/**
 * After a deliverable: refinements revise it in this chat; next steps start a
 * new chat with the skill that takes the work forward.
 */
function FollowUps({
  kind,
  title,
  actionId,
  onRefine,
}: Readonly<{
  kind: string;
  title: string;
  actionId: string | null;
  onRefine: (instruction: string) => void;
}>) {
  const next = nextStepsFor(kind, title);
  return (
    <div className="grid gap-3">
      <fieldset aria-label="Quick refinements" className="flex flex-wrap gap-2">
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
                href={agentHandoffHref({ actionId, prompt: step.prompt, skillId: step.skillId })}
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
    return step.status === 'completed'
      ? 'Read CiteLadder data'
      : 'A data read returned nothing usable';
  return 'Worked on the reply';
}

function RunState({
  outcome,
  progress,
  onStop,
  stopping,
}: Readonly<{
  outcome: ReturnType<typeof runOutcome>;
  progress: AgentRun['progress'];
  onStop: () => void;
  stopping: boolean;
}>) {
  switch (outcome.kind) {
    case 'running':
      return (
        <output className={cn('grid gap-2', textRole('body'))}>
          <span className="flex items-center gap-3">
            <Spinner className="text-muted" />
            <span className="flex-1">
              {outcome.queued ? 'Waiting to start…' : 'The agent is working…'}
            </span>
            <Button variant="ghost" size="sm" disabled={stopping} onClick={onStop}>
              Stop
            </Button>
          </span>
          {progress.length > 0 ? (
            <ol aria-label="Agent progress" className="grid gap-1 ps-8">
              {progress.map((step) => (
                <li key={step.ordinal} className={textRole('caption')}>
                  {runStepLabel(step)}
                </li>
              ))}
            </ol>
          ) : null}
        </output>
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
