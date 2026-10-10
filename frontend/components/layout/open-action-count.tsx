'use client';

import { useQuery } from '@tanstack/react-query';

import { textRole } from '@/components/ui/typography';
import { actionsQueries } from '@/lib/api/actions';
import { useProjectContext } from '@/lib/project/project-context';

/** Open plus in-progress Actions for the active project, beside the Actions destination. */
export function OpenActionCount() {
  const { activeProjectId, activeWorkspaceId } = useProjectContext();
  const query = useQuery({
    ...actionsQueries.list(activeWorkspaceId ?? '', activeProjectId ?? ''),
    enabled: Boolean(activeWorkspaceId && activeProjectId),
  });
  const counts = query.data?.status_counts;
  if (!counts) return null;
  const count = (counts.open ?? 0) + (counts.in_progress ?? 0);
  return (
    <>
      <span aria-hidden className={textRole('caption', 'tabular-nums')}>
        {count}
      </span>
      <span className="sr-only">, {count} open</span>
    </>
  );
}
