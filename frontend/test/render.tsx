import { QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { createAppQueryClient } from '@/lib/api/query-client';
import { ProjectSelectionProvider, type ProjectContextValue } from '@/lib/project/project-scope';

const TEST_WORKSPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/**
 * A resolved, empty workspace — the minimum every authed screen mounts inside.
 *
 * Screens read the workspace to scope their requests and cache keys, so
 * rendering one without this context is a failure mode of the harness rather
 * than of the component (the same reason `TooltipProvider` is here).
 */
function testProjectSelection(overrides: Partial<ProjectContextValue> = {}): ProjectContextValue {
  return {
    workspaces: [],
    activeWorkspaceId: TEST_WORKSPACE_ID,
    activeWorkspace: null,
    setActiveWorkspaceId: vi.fn(),
    projects: [],
    activeProject: null,
    activeProjectId: null,
    setActiveProjectId: vi.fn(),
    status: 'ready',
    retry: vi.fn(),
    isLoading: false,
    isError: false,
    ...overrides,
  };
}

type ProvidersOptions = Omit<RenderOptions, 'wrapper'> & {
  /** Override the resolved workspace/project context for this render. */
  projectSelection?: Partial<ProjectContextValue>;
};

/**
 * Render a component inside a fresh TanStack Query provider (F4 tests). A new
 * client per render keeps cache state isolated between tests, and the shared
 * factory means the real retry policy applies.
 *
 * A TooltipProvider is included because every app route mounts one — without
 * it a component that renders a Tooltip throws under test but works in the
 * app, which is a failure mode of the harness rather than the component. The
 * workspace/project selection is included for the same reason.
 *
 * The selection comes from `project-scope`, which is the module the real
 * provider publishes through — so a test file that mocks
 * `@/lib/project/project-context` to control what its component READS still
 * renders inside a valid context here.
 */
export function renderWithProviders(ui: ReactElement, options?: ProvidersOptions) {
  const queryClient = createAppQueryClient();
  const { projectSelection, ...renderOptions } = options ?? {};
  const selection = testProjectSelection(projectSelection);

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ProjectSelectionProvider value={selection}>{children}</ProjectSelectionProvider>
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
}
