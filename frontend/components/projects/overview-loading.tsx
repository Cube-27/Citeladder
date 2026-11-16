import { QueryClientContext } from '@tanstack/react-query';
import { useContext } from 'react';

import type {
  OverviewLayout,
  OverviewWidget,
  OverviewWidgetKey,
} from '@citeladder/contracts/overview';
import { AppGrid } from '@/components/ui/app-grid';
import {
  ShapeBlocks,
  SkeletonBlock,
  SkeletonFrame,
  TitleBlock,
  type LoadingShape,
} from '@/components/ui/skeleton-block';
import { slipClasses } from '@/components/ui/slip';
import { projectKeys } from '@/lib/api/query-keys/core';
import { loneHalves } from '@/lib/overview/layout';
import { useOptionalProjectContext } from '@/lib/project/project-scope';
import { cn } from '@/lib/utils';

/** Each widget's body as it loads: the shape of what its card shows. */
const WIDGET_SHAPES: Record<OverviewWidgetKey, LoadingShape> = {
  project_state: { kind: 'figures', count: 3 },
  citation_share: { kind: 'figures', count: 1 },
  movement: { kind: 'chart', height: 'sm' },
  next_action: { kind: 'list', rows: 3 },
  missing_prompts: { kind: 'list', rows: 3 },
  ranked_actions: { kind: 'list', rows: 3 },
  progress_proof: { kind: 'figures', count: 2 },
  company_facts: { kind: 'facts', rows: 3 },
  visibility_trend: { kind: 'chart', height: 'sm' },
  share_of_voice: { kind: 'facts', rows: 5 },
  top_movers: { kind: 'facts', rows: 5 },
  retrieval: { kind: 'facts', rows: 5 },
  perception: { kind: 'figures', count: 3 },
  ai_traffic: { kind: 'figures', count: 3 },
  search_console: { kind: 'figures', count: 3 },
};

/** The layout a project shows before it saves one: the API's `overview_default_layout`. */
const DEFAULT_WIDGETS: readonly OverviewWidget[] = [
  { key: 'project_state', size: 'half' },
  { key: 'citation_share', size: 'half' },
  { key: 'movement', size: 'half' },
  { key: 'next_action', size: 'half' },
  { key: 'missing_prompts', size: 'full' },
  { key: 'ranked_actions', size: 'half' },
  { key: 'progress_proof', size: 'half' },
  { key: 'company_facts', size: 'full' },
];

/** A widget's loading body, for a widget that loads its own read. */
export function overviewWidgetShape(key: OverviewWidgetKey): LoadingShape {
  return WIDGET_SHAPES[key];
}

/**
 * The saved layout when the cache already holds it, read without a provider
 * so the shell's fallback can draw it too.
 */
function useCachedWidgets(): readonly OverviewWidget[] | undefined {
  const client = useContext(QueryClientContext);
  const project = useOptionalProjectContext()?.activeProject;
  if (!client || !project) return undefined;
  const key = projectKeys.overviewLayout({
    workspaceId: project.workspace_id,
    projectId: project.id,
  });
  return client.getQueryData<OverviewLayout>(key)?.widgets;
}

/**
 * The Overview as it loads: the project's meta line, then one card per widget
 * placed in the halves grid as OverviewGrid places them (the saved layout
 * when known, else the default), each a title block over its widget's shape.
 */
export function OverviewLoading({ widgets }: Readonly<{ widgets?: readonly OverviewWidget[] }>) {
  const cached = useCachedWidgets();
  const shown = widgets ?? cached ?? DEFAULT_WIDGETS;
  const lone = loneHalves(shown);
  return (
    <SkeletonFrame
      label="Loading the Overview"
      variant="overview"
      className="flex flex-col gap-[var(--page-top-gap)]"
    >
      <span className="flex h-4 items-center">
        <SkeletonBlock className="w-60 max-w-full" />
      </span>
      <AppGrid layout="halves">
        {shown.map((widget) => (
          <div
            key={widget.key}
            data-loading-widget={widget.key}
            className={cn(
              'min-w-0',
              (widget.size === 'full' || lone.has(widget.key)) && 'column-wide:col-span-2',
            )}
          >
            <div className={slipClasses('flex h-full flex-col gap-[var(--workspace-gap)]')}>
              <span className="flex h-6 items-center">
                <TitleBlock />
              </span>
              <ShapeBlocks shape={WIDGET_SHAPES[widget.key]} />
            </div>
          </div>
        ))}
      </AppGrid>
    </SkeletonFrame>
  );
}
