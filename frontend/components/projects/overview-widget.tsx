import type { ReactNode } from 'react';

import type { OverviewWidgetKey } from '@citeladder/contracts/overview';
import type { CommandCenter, Project } from '@citeladder/contracts';

import { CompanyFacts, Movement, ProjectStateCard, RankedActionsCard } from './dashboard-sections';
import { NextAction } from './next-action-card';
import { reached } from './overview-start';
import { MissingPrompts } from './missing-prompts';
import {
  AiTrafficWidget,
  PerceptionWidget,
  RetrievalWidget,
  SearchConsoleWidget,
  ShareOfVoiceWidget,
  TopMoversWidget,
  VisibilityTrendWidget,
} from './overview-library-widgets';
import type { useCommandCenterActions } from './use-command-center-actions';

type WidgetProps = {
  data: CommandCenter;
  project: Project;
  actions: ReturnType<typeof useCommandCenterActions>;
};

/** Every widget by its layout key; a key with no entry fails the type check. */
const WIDGETS: Record<OverviewWidgetKey, (props: WidgetProps) => ReactNode> = {
  project_state: ({ data }) => <ProjectStateCard data={data} />,
  movement: ({ data }) => <Movement data={data} />,
  next_action: ({ data }) => <NextAction data={data} />,
  missing_prompts: ({ project }) => (
    <MissingPrompts projectId={project.id} workspaceId={project.workspace_id} />
  ),
  ranked_actions: ({ actions }) => (
    <RankedActionsCard
      actions={actions.actions}
      pending={actions.reorderPending}
      onMove={actions.move}
    />
  ),
  company_facts: ({ data }) => <CompanyFacts data={data} />,
  visibility_trend: ({ project }) => <VisibilityTrendWidget project={project} />,
  share_of_voice: ({ project }) => <ShareOfVoiceWidget project={project} />,
  top_movers: ({ project }) => <TopMoversWidget project={project} />,
  retrieval: ({ project }) => <RetrievalWidget project={project} />,
  perception: ({ project }) => <PerceptionWidget project={project} />,
  ai_traffic: ({ project }) => <AiTrafficWidget project={project} />,
  search_console: ({ project }) => <SearchConsoleWidget project={project} />,
};

/**
 * Before the first measured run, the widgets that have something to show: the
 * rest would be empty cards, so they return as their data arrives. Nothing is
 * removed from the layout.
 */
const SHOWS_BEFORE_RUN: Partial<Record<OverviewWidgetKey, (data: CommandCenter) => boolean>> = {
  company_facts: ({ facts }) =>
    Boolean(
      facts.positioning.trim() ||
      facts.description.trim() ||
      facts.target_audience.trim() ||
      facts.products_services.length,
    ),
  ranked_actions: ({ actions }) => actions.length > 0,
  ai_traffic: ({ loop }) => reached(loop.connected),
  search_console: ({ loop }) => reached(loop.connected),
};

/** Whether the widget is drawn: always once a run is measured. */
export function widgetShows(key: OverviewWidgetKey, data: CommandCenter): boolean {
  if (data.measurement) return true;
  return SHOWS_BEFORE_RUN[key]?.(data) ?? false;
}

/** One Overview widget by its layout key. */
export function OverviewWidgetView({
  widgetKey,
  ...props
}: Readonly<WidgetProps & { widgetKey: OverviewWidgetKey }>) {
  return WIDGETS[widgetKey](props);
}
