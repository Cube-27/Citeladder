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
import { OverviewStart, needsStart } from './overview-start';
import { OverviewWidgetView, widgetShows } from './overview-widget';
import { useCommandCenterActions } from './use-command-center-actions';
import { AppGrid } from '@/components/ui/app-grid';
import { Notice, readErrorProps } from '@/components/ui/notice';
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
          {...readErrorProps(commandCenter)}
          title="Couldn't load the Overview"
          fallback="The Overview's figures could not be loaded."
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

/** Widgets the loading shape holds a place for: the default layout's first two rows. */
const LOADING_WIDGETS = 4;

/** The widget grid's shape: a card per widget with its figures, so nothing moves when they land. */
function DashboardLoading() {
  return (
    <ReportPage>
      <AppGrid layout="halves" aria-busy="true">
        {Array.from({ length: LOADING_WIDGETS }, (_, index) => (
          <div key={index} className={slipClasses()}>
            <Skeleton
              variant={index % 2 ? 'block' : 'stat'}
              label={index === 0 ? 'Loading the Overview' : undefined}
            />
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
          {...readErrorProps(layout.query)}
          title="Couldn't load the Overview layout"
          fallback="The Overview layout could not be loaded."
        />
      </ReportPage>
    );
  if (!layout.query.data) return <DashboardLoading />;
  const saved = layout.query.data;
  const widgets = saved.widgets.filter((widget) => widgetShows(widget.key, data));
  return (
    <ReportPage
      actions={
        <DashboardActions
          activeProject={activeProject}
          onEditProject={onEditProject}
          downloading={actions.downloading}
          onDownload={actions.download}
          launch={Boolean(data.measurement)}
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
      {needsStart(data) ? <OverviewStart data={data} /> : null}
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
      {/* While editing, every saved widget is shown, so the whole layout can be arranged. */}
      <OverviewGrid
        widgets={editing ? saved.widgets : widgets}
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
