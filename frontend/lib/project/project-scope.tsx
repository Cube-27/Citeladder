import { createContext, useContext, type ReactNode } from 'react';

import type { Project, ProjectSummary, Workspace } from '@citeladder/contracts';
import type { FailureScope, SelectionStatus } from '@/lib/project/selection';

export type ProjectContextValue = {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  activeWorkspace: Workspace | null;
  setActiveWorkspaceId: (workspaceId: string) => void;
  projects: ProjectSummary[];
  projectsSettled: boolean;
  activeProject: Project | null;
  activeProjectId: string | null;
  setActiveProjectId: (projectId: string) => void;
  status: SelectionStatus;
  errorScope: FailureScope;
  retry: () => void;
  isLoading: boolean;
  isError: boolean;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectSelectionProvider({
  value,
  children,
}: Readonly<{ value: ProjectContextValue; children: ReactNode }>) {
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjectContext(): ProjectContextValue {
  const context = useOptionalProjectContext();
  if (!context) {
    throw new Error('useProjectContext must be used within a <ProjectProvider>.');
  }
  return context;
}

export function useOptionalProjectContext(): ProjectContextValue | null {
  return useContext(ProjectContext);
}

const NO_SCOPE = { activeProjectId: null, activeWorkspaceId: null, activeProject: null } as const;

export function useNavScope(): Pick<
  ProjectContextValue,
  'activeProjectId' | 'activeWorkspaceId' | 'activeProject'
> {
  return useOptionalProjectContext() ?? NO_SCOPE;
}

export function useActiveProject(): Project | null {
  return useProjectContext().activeProject;
}

export function useActiveWorkspaceId(): string | null {
  return useProjectContext().activeWorkspaceId;
}

type WorkspaceCapability =
  | 'read'
  | 'write'
  | 'run'
  | 'manage_billing'
  | 'manage_members'
  | 'manage_credentials'
  | 'delete_projects'
  | 'transfer_ownership';

export function useWorkspaceCapability(capability: WorkspaceCapability): boolean {
  const { activeWorkspace } = useProjectContext();
  return activeWorkspace?.capabilities.includes(capability) ?? false;
}
