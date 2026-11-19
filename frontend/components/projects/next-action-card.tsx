import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { ProjectLink } from '@/components/ui/project-link';

import { ActionButton, ACTIONS } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { DisplayTime } from '@/components/ui/display-time';
import { Icon } from '@/components/ui/icon';
import { textRole } from '@/components/ui/typography';
import { pluralCount } from '@/lib/format';
import type { CommandCenter } from '@citeladder/contracts';
import { StatusMark, type StatusTone } from '@/components/ui/status-mark';

import { ActionFacts } from './dashboard-primitives';
import { WidgetFrame } from './widget-frame';

/** A step that asks the reader to act needs attention. */
const RECOMMENDED = { status: 'Action recommended', tone: 'warning' } as const;

/**
 * Every step the server can name; steps that are not a call to act say what
 * they are. The button names where it goes, never a bare "Continue".
 */
const NEXT_ACTION_COPY: Record<
  CommandCenter['next_action']['kind'],
  { status: string; tone: StatusTone; link: string }
> = {
  opportunity: { ...RECOMMENDED, link: ACTIONS.openAction.label },
  connect: { ...RECOMMENDED, link: 'Open Integrations' },
  crawl: { ...RECOMMENDED, link: 'Open Site health' },
  configure_prompts: { ...RECOMMENDED, link: ACTIONS.addPrompts.label },
  audit: { ...RECOMMENDED, link: 'Open Runs' },
  audit_running: { status: 'In progress', tone: 'info', link: 'View progress' },
  monitor: { status: 'Up to date', tone: 'positive', link: 'View trends' },
};

/**
 * The persisted facts behind the step, from what the Overview already reads:
 * the Action's target and evidence, the prompts a run would measure, or the
 * limitation the loop recorded. Null when there is nothing to add.
 */
function nextActionEvidence(data: CommandCenter): ReactNode {
  const step = data.next_action;
  switch (step.kind) {
    case 'opportunity': {
      const action = data.actions.find((item) => item.id === step.opportunity_id);
      return action ? <ActionFacts action={action} /> : null;
    }
    case 'audit':
    case 'audit_running':
      return (
        <p className={textRole('caption')}>
          {pluralCount(data.active_prompt_count, 'active prompt')} to measure
        </p>
      );
    case 'crawl':
      return captionOrNull(data.loop.analyzed.limitations[0]);
    case 'connect':
      return captionOrNull(data.loop.connected.limitations[0]);
    case 'monitor':
      return data.measurement ? (
        <p className={textRole('caption')}>
          Last run <DisplayTime value={data.measurement.completed_at} />
        </p>
      ) : null;
    case 'configure_prompts':
      return null;
    default:
      return step.kind satisfies never;
  }
}

function captionOrNull(text: string | undefined) {
  return text ? <p className={textRole('caption')}>{text}</p> : null;
}

export function NextAction({ data }: Readonly<{ data: CommandCenter }>) {
  const copy = NEXT_ACTION_COPY[data.next_action.kind];
  const step = data.next_action;
  // An opportunity whose Action is not created yet links to the Actions list.
  const listOnly = step.kind === 'opportunity' && step.href === '/actions';
  return (
    <WidgetFrame
      id="next-action"
      title="Next action"
      status={<StatusMark tone={copy.tone}>{copy.status}</StatusMark>}
    >
      <p className={textRole('label')}>{step.title}</p>
      {nextActionEvidence(data)}
      <div>
        {step.kind === 'opportunity' && !listOnly ? (
          <ActionButton action="openAction" href={step.href} />
        ) : (
          // Every other step goes somewhere: the page's one primary is Launch run.
          <Button asChild variant="secondary">
            <ProjectLink href={step.href}>
              {listOnly ? 'Open Actions' : copy.link}
              <Icon icon={ArrowRight} />
            </ProjectLink>
          </Button>
        )}
      </div>
    </WidgetFrame>
  );
}
