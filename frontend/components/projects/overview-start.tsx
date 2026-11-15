import { ArrowRight, Plus } from 'lucide-react';

import type { CommandCenter } from '@citeladder/contracts';
import { LaunchAuditButton } from '@/components/runs/launch-audit-button';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Stack } from '@/components/ui/layout';
import { ProjectLink } from '@/components/ui/project-link';
import { RungTrail, type RungStatus, type TrailStep } from '@/components/ui/rung-trail';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/ui/section';
import { pluralCount } from '@/lib/format';
import { PROMPTS_HREF } from '@/lib/prompts/routes';

/** Whether a loop stage has evidence yet. */
const reached = (stage: CommandCenter['loop']['connected']) =>
  stage.state === 'observed' || stage.state === 'partial';

/** The Overview shows its start card until a run is measured and prompts are tracked. */
export function needsStart(data: CommandCenter): boolean {
  return !data.measurement || data.active_prompt_count === 0;
}

function startSteps(data: CommandCenter): TrailStep[] {
  const prompts = data.active_prompt_count > 0;
  const running = data.next_action.kind === 'audit_running';
  let runStatus: RungStatus = running ? 'running' : 'pending';
  if (data.measurement) runStatus = 'done';
  return [
    {
      id: 'prompts',
      label: 'Add prompts',
      status: prompts ? 'done' : 'pending',
      detail: prompts
        ? pluralCount(data.active_prompt_count, 'active prompt')
        : 'Choose the questions buyers ask that you want to track.',
    },
    {
      id: 'run',
      label: 'Launch run',
      status: runStatus,
      detail: data.measurement
        ? null
        : 'Each engine answers your prompts; the run measures how they cite you.',
    },
    {
      id: 'crawl',
      label: 'Run crawl',
      status: reached(data.loop.analyzed) ? 'done' : 'pending',
      detail: 'Finds the page issues behind later Actions.',
    },
    {
      id: 'connect',
      label: 'Connect Search Console or GA4',
      status: reached(data.loop.connected) ? 'done' : 'pending',
      detail: 'Adds clicks and AI referrals to the Overview.',
    },
  ];
}

/**
 * The one card a project sees before its Overview has figures: the steps as a
 * rung trail and the one button for the step that is next. Widgets join it as
 * their data arrives. With no run yet, its button is the view's primary.
 */
export function OverviewStart({ data }: Readonly<{ data: CommandCenter }>) {
  const firstRun = !data.measurement;
  return (
    <Section aria-labelledby="overview-start">
      <SectionHeader>
        <SectionTitle id="overview-start">
          {firstRun ? 'Get your first results' : 'Track prompts again'}
        </SectionTitle>
        <SectionDescription>
          {firstRun
            ? 'The Overview fills in as each step finishes.'
            : 'No prompt is active, so the next run has nothing to measure.'}
        </SectionDescription>
      </SectionHeader>
      <Stack gap="workspace">
        <RungTrail label="Steps to your first results" steps={startSteps(data)} />
        <div>
          <StartButton data={data} primary={firstRun} />
        </div>
      </Stack>
    </Section>
  );
}

function StartButton({ data, primary }: Readonly<{ data: CommandCenter; primary: boolean }>) {
  if (data.active_prompt_count === 0)
    return (
      <Button asChild variant={primary ? 'primary' : 'secondary'}>
        <ProjectLink href={PROMPTS_HREF}>
          <Icon icon={Plus} />
          Add prompts
        </ProjectLink>
      </Button>
    );
  if (data.next_action.kind === 'audit_running')
    return (
      <Button asChild variant="secondary">
        <ProjectLink href={data.next_action.href}>
          View progress
          <Icon icon={ArrowRight} />
        </ProjectLink>
      </Button>
    );
  return <LaunchAuditButton />;
}
