import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { MastheadPrimary } from '@/components/ui/masthead-actions';
import { ReportPage } from '@/components/templates/report-page';
import type { Project } from '@citeladder/contracts';
import { useProjectCreation } from '@/components/layout/use-project-creation';
import { FolderOpen, Plus } from '@/lib/icons';
import { useProjectContext } from '@/lib/project/project-context';
import { finishOnboardingNavigationHandoff } from '@/lib/onboarding/timing';
import { newProjectDestination } from '@/lib/navigation/project-destination';

import { ProjectEditPanel } from './project-edit-panel';
import { DashboardScreen } from './dashboard-screen';
import { OverviewLoading } from './overview-loading';
import { StateBlock } from '@/components/ui/state-block';

/**
 * `/projects` — manage every project in the workspace.
 *
 * Built for agencies and multi-brand teams, who are the users with more than
 * one: the project switcher in the sidebar is fine for hopping between two, but
 * not for seeing what you have. This takes the sidebar slot the retired "Setup"
 * item left behind, and owns the "add another project" entry point that
 * `/setup/new` used to.
 *
 * Creating goes through `/onboarding?new=1` — the same discovery flow as the
 * first project, because a second brand needs its competitors and prompts found
 * just as much as the first did.
 */
export function ProjectsScreen() {
  const { projects, projectsSettled, activeProject, status } = useProjectContext();
  const searchParams = useSearchParams()[0];
  const requestedProjectId = searchParams?.get('project') ?? null;
  const [editing, setEditing] = useState<Project | null>(null);
  const navigate = useNavigate();
  // Write access edits and adds projects; a Viewer is offered neither.
  const { activeWorkspaceId, canAddProject, mayCreate } = useProjectCreation();

  // The source mark carries the committed UUID. Close it after this route has
  // committed with that same authorized project, never for a fallback project.
  useEffect(() => {
    if (requestedProjectId && status === 'ready' && activeProject?.id === requestedProjectId) {
      finishOnboardingNavigationHandoff(requestedProjectId);
    }
  }, [activeProject?.id, requestedProjectId, status]);

  // "No projects yet" is a CLAIM about the workspace, so it needs a settled
  // answer. The gate does not supply one: its `ready` state is reached by a
  // directly-resolved project alone, deliberately, so a brand-new project is
  // usable before the list reconciles — and the list is `[]` while it loads.
  // Reading that as "no projects" is what showed this empty state to someone
  // who had just created their first project, until they refreshed.
  if (projects.length === 0 && !projectsSettled) {
    return (
      <ReportPage>
        <OverviewLoading />
      </ReportPage>
    );
  }
  if (projects.length === 0) {
    // The page's one primary sits in the masthead; the empty state names it.
    return (
      <ReportPage
        actions={
          mayCreate ? (
            <MastheadPrimary>
              <Button
                variant="primary"
                disabled={!canAddProject}
                onClick={() => navigate(newProjectDestination(activeWorkspaceId))}
              >
                <Icon icon={Plus} />
                Add project
              </Button>
            </MastheadPrimary>
          ) : undefined
        }
      >
        <StateBlock kind="empty" icon={FolderOpen} heading="No projects yet" />
      </ReportPage>
    );
  }

  // A fragment: the dashboard is its own ReportPage, and
  // the edit panel is an overlay, so there is no rhythm here to own.
  return (
    <>
      <DashboardScreen onEditProject={mayCreate ? (project) => setEditing(project) : undefined} />

      {editing ? (
        <ProjectEditPanel
          key={editing.id}
          project={editing}
          open
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}
