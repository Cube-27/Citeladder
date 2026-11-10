import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { ProjectLink } from '@/components/ui/project-link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardEyebrow, CardHeader, CardTitle } from '@/components/ui/card';
import { DisplayTime } from '@/components/ui/display-time';
import { Icon } from '@/components/ui/icon';
import { Inline, Stack } from '@/components/ui/layout';
import { textRole } from '@/components/ui/typography';
import { pluralCount, readableUrl } from '@/lib/format';
import { severityLabel, severityPriority } from '@/lib/site-health/issues';
import type { CommandCenter } from '@citeladder/contracts';

const RECOMMENDED = 'Action recommended';

/**
 * Every step the server can name; steps that are not a call to act say what
 * they are. The button names where it goes, never a bare "Continue".
 */
const NEXT_ACTION_COPY: Record<
  CommandCenter['next_action']['kind'],
  { status: string; link: string; reason: string }
> = {
  opportunity: {
    status: RECOMMENDED,
    link: 'Open the Action',
    reason: 'The first open Action in the shared ranked order.',
  },
  connect: {
    status: RECOMMENDED,
    link: 'Open Integrations',
    reason: 'Search Console or GA4 data sharpens which Actions matter most.',
  },
  crawl: {
    status: RECOMMENDED,
    link: 'Open Site Health',
    reason: 'A site crawl finds the page issues that sharpen later Actions.',
  },
  configure_prompts: {
    status: RECOMMENDED,
    link: 'Choose prompts',
    reason: 'Nothing can be measured until the project tracks the questions buyers ask.',
  },
  audit: {
    status: RECOMMENDED,
    link: 'Open Runs',
    reason: 'A run measures how answer engines name and cite you for every tracked prompt.',
  },
  audit_running: {
    status: 'In progress',
    link: 'View progress',
    reason: 'Results appear here as soon as the run finishes.',
  },
  monitor: {
    status: 'Up to date',
    link: 'View trends',
    reason: 'Every open Action is handled; the next run shows whether visibility moves.',
  },
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
      if (!action) return null;
      return (
        <Inline>
          <Badge variant="priority" value={severityPriority(action.severity)}>
            {severityLabel(action.severity)}
          </Badge>
          <span className={textRole('caption', 'min-w-0 truncate')}>
            {action.target_label ? readableUrl(action.target_label) : 'Project-wide'} ·{' '}
            {pluralCount(action.evidence_summary.count, 'persisted evidence item')}
          </span>
        </Inline>
      );
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
  // An opportunity whose Action is not created yet links to the Actions list.
  const link =
    data.next_action.kind === 'opportunity' && data.next_action.href === '/agent/actions'
      ? 'Open Actions'
      : copy.link;
  return (
    <Card aria-labelledby="next-action" className="text-ink h-full">
      <CardHeader actions={<span className={textRole('label')}>{copy.status}</span>}>
        <CardEyebrow>Next action</CardEyebrow>
        <CardTitle id="next-action">{data.next_action.title}</CardTitle>
      </CardHeader>
      <Stack as={CardContent} gap="compact">
        <p className={textRole('body')}>{copy.reason}</p>
        {nextActionEvidence(data)}
        <div>
          <Button asChild variant="primary">
            <ProjectLink href={data.next_action.href}>
              {link}
              <Icon icon={ArrowRight} />
            </ProjectLink>
          </Button>
        </div>
      </Stack>
    </Card>
  );
}
