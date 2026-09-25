'use client';

import { FileText } from 'lucide-react';

import { skillLabel, useSkillCatalog } from '@/components/agent/skill-picker';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Pressable } from '@/components/ui/pressable';
import { panelClasses } from '@/components/ui/panel';
import { Spinner } from '@/components/ui/spinner';
import { textRole } from '@/components/ui/typography';
import { runErrorCopy, OUTPUT_PHASE_LABEL, outputKindLabel } from '@/lib/agent/vocabulary';
import { runOutcome } from '@/lib/agent/run-state';
import type { AgentChatDetail, AgentMessage } from '@/lib/api/agent';
import { ContentMarkdown } from '@/lib/markdown/markdown';
import { cn } from '@/lib/utils';

/** Follow-ups that revise the chat's output as ordinary turns. */
const REFINEMENTS = ['Make it shorter', 'Make it more specific', 'No standalone FAQ'] as const;

/**
 * The chat's append-only messages, the latest run's state and, once there is
 * an output, a card that focuses the output pane plus quick refinements.
 */
export function Conversation({
  detail,
  onOpenOutput,
  onRefine,
  onStop,
  stopping,
  canSend,
}: Readonly<{
  detail: AgentChatDetail;
  onOpenOutput: () => void;
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
      <RunState outcome={outcome} onStop={onStop} stopping={stopping} />
      {output?.latest_revision ? (
        <Pressable
          onClick={onOpenOutput}
          className={panelClasses(
            { pad: 'compact' },
            'focus-ring hover:bg-active flex items-center gap-3 text-left',
          )}
        >
          <FileText className="text-accent-text size-4 shrink-0" aria-hidden />
          <span className="grid min-w-0 gap-0.5">
            <span className={textRole('bodyStrong', 'truncate')}>
              {output.latest_revision.title}
            </span>
            <span className={textRole('meta')}>
              {outputKindLabel(output.kind)} · {OUTPUT_PHASE_LABEL[output.phase]} · Revision{' '}
              {output.latest_revision.number}
            </span>
          </span>
        </Pressable>
      ) : null}
      {output?.latest_revision && canSend && outcome.kind !== 'running' ? (
        <fieldset aria-label="Quick refinements" className="flex flex-wrap gap-2">
          {REFINEMENTS.map((instruction) => (
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
        {skill ? <span className={textRole('meta')}>Skill: {skill}</span> : null}
        {message.evidence_refs.length > 0 ? (
          <span className={textRole('meta')}>
            {message.evidence_refs.length} evidence{' '}
            {message.evidence_refs.length === 1 ? 'reference' : 'references'}
          </span>
        ) : null}
      </div>
      <ContentMarkdown markdown={message.content} density="compact" />
      {message.steps.length > 0 ? (
        <details className="group">
          <summary className={textRole('meta', 'cursor-pointer')}>
            Run complete · {message.steps.length} {message.steps.length === 1 ? 'step' : 'steps'}
            {tools > 0 ? ` · ${tools} data ${readsLabel}` : ''}
          </summary>
          <ul className="grid gap-1 ps-4 pt-2">
            {message.steps.map((step, index) => (
              <li key={`${step.kind}-${index}`} className={textRole('meta')}>
                {stepLabel(step)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
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
  onStop,
  stopping,
}: Readonly<{
  outcome: ReturnType<typeof runOutcome>;
  onStop: () => void;
  stopping: boolean;
}>) {
  switch (outcome.kind) {
    case 'running':
      return (
        <output className={cn('flex items-center gap-3', textRole('body'))}>
          <Spinner className="text-muted" />
          <span className="flex-1">
            {outcome.queued ? 'Waiting to start…' : 'The agent is working…'}
          </span>
          <Button variant="ghost" size="sm" disabled={stopping} onClick={onStop}>
            Stop
          </Button>
        </output>
      );
    case 'stopped_at_limit':
      return <Alert tone="warning">{runErrorCopy('stopped_at_limit')}</Alert>;
    case 'failed':
      return <Alert tone="danger">{runErrorCopy(outcome.code)}</Alert>;
    case 'cancelled':
      return <p className={textRole('meta')}>Stopped. Nothing from this turn was saved.</p>;
    default:
      return null;
  }
}
