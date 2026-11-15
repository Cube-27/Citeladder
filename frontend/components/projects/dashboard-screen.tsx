import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { OverviewWidget } from '@citeladder/contracts/overview';
import { ReportPage } from '@/components/templates/report-page';
import { projectQueries } from '@/lib/api/projects';
import type { CommandCenter, Project } from '@citeladder/contracts';
import { useOverviewLayout } from '@/lib/overview/use-overview-layout';
import { warmOverviewWidgets } from '@/lib/overview/widget-queries';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useWorkspaceCapability } from '@/lib/project/project-context';

import { DashboardActions, ProjectMeta } from './dashboard-sections';
import { OverviewGrid } from './overview-grid';
import { OverviewLayoutMenu } from './overview-layout-menu';
import { OverviewWidgetView } from './overview-widget';
import { PromptSetupCard } from './prompt-setup-card';
import { useCommandCenterActions } from './use-command-center-actions';
import { AppGrid } from '@/components/ui/app-grid';
import { Notice } from '@/components/ui/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { slipClasses } from '@/components/ui/slip';
import { StateBlock } from '@/components/ui/state-block';

export function DashboardScreen({
  onEditProject,
}: Readonly<{ onEditProject?: (project: Project) => void }> = {}) {
  const { workspaceId, projectId, project } = useProjectScope();
  const scope = { workspaceId, projectId };
  const commandCenter = useQuery(projectQueries.commandCenter(scope));
  // The layout does not depend on the command center, so it is asked for
  // beside it rather than once the command center has rendered.
  const layout = useQuery(projectQueries.overviewLayout(scope));
  useWarmWidgets(project, layout.data?.widgets);

  if (commandCenter.isLoading) return <DashboardLoading />;
  if (commandCenter.isError || !commandCenter.data)
    return (
      <ReportPage>
        <StateBlock
          kind="error"
          error={commandCenter.error}
          title="Couldn't load the Overview"
          fallback="The Overview's figures could not be loaded."
          onRetry={() => void commandCenter.refetch()}
          pending={commandCenter.isFetching}
        />
      </ReportPage>
    );

  return (
    <DashboardData
      data={commandCenter.data}
      activeProject={project}
      onEditProject={onEditProject}
    />
  );
}

/**
 * Start the widgets' reads as soon as the layout names them, instead of when
 * they mount behind the command center. Best-effort: a widget still asks for
 * its own read and reports its own failure.
 */
function useWarmWidgets(project: Project, widgets: readonly OverviewWidget[] | undefined) {
  const client = useQueryClient();
  useEffect(() => {
    if (widgets) void warmOverviewWidgets(client, project, widgets).catch(() => {});
  }, [client, project, widgets]);
}

/** Widgets the ruled blank holds a place for: the default layout's first two rows. */
const LOADING_WIDGETS = 4;

/**
 * The ruled blank of the widget grid: blank slips where the widgets land, the
 * first carrying the one live rung, so the page does not move when they do.
 */
function DashboardLoading() {
  return (
    <ReportPage>
      <AppGrid layout="halves" aria-busy="true">
        {Array.from({ length: LOADING_WIDGETS }, (_, index) => (
          <div key={index} className={slipClasses('min-h-64')}>
            {index === 0 ? <Skeleton variant="block" label="Loading the Overview" /> : null}
          </div>
        ))}
      </AppGrid>
    </ReportPage>
  );
}

function DashboardData({
  data,
  activeProject,
  onEditProject,
}: Readonly<{
  data: CommandCenter;
  activeProject: Project;
  onEditProject?: (project: Project) => void;
}>) {
  const actions = useCommandCenterActions(data, activeProject);
  const layout = useOverviewLayout(activeProject);
  const canEdit = useWorkspaceCapability('write');
  const [editing, setEditing] = useState(false);
  if (layout.query.isError)
    return (
      <ReportPage>
        <StateBlock
          kind="error"
          error={layout.query.error}
          title="Couldn't load the Overview layout"
          fallback="The Overview layout could not be loaded."
          onRetry={() => void layout.query.refetch()}
          pending={layout.query.isFetching}
        />
      </ReportPage>
    );
  if (!layout.query.data) return <DashboardLoading />;
  const saved = layout.query.data;
  return (
    <ReportPage
      actions={
        <DashboardActions
          activeProject={activeProject}
          onEditProject={onEditProject}
          downloading={actions.downloading}
          onDownload={actions.download}
          layoutMenu={
            canEdit ? (
              <OverviewLayoutMenu
                layout={saved}
                editing={editing}
                pending={layout.pending}
                onEditingChange={setEditing}
                onSave={layout.save}
              />
            ) : null
          }
        />
      }
    >
      <ProjectMeta data={data} />
      {data.active_prompt_count === 0 ? <PromptSetupCard /> : null}
      {actions.downloadError ? (
        <Notice tone="negative">The report could not be downloaded. Try again.</Notice>
      ) : null}
      {actions.reorderError ? (
        <Notice tone="warning">
          The shared action order changed. Review the refreshed order and try again.
        </Notice>
      ) : null}
      {layout.failed ? (
        <Notice tone="warning">
          Someone else changed this Overview. The latest layout is shown; make your change again.
        </Notice>
      ) : null}
      <OverviewGrid
        widgets={saved.widgets}
        editing={canEdit && editing}
        pending={layout.pending}
        onChange={layout.save}
        render={(widget) => (
          <OverviewWidgetView
            widgetKey={widget.key}
            data={data}
            project={activeProject}
            actions={actions}
          />
        )}
      />
    </ReportPage>
  );
}
