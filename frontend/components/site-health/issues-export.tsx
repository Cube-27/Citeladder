import { ExportAction } from '@/components/ui/export-action';
import type { IssueExportParams } from '@/lib/api/site-health';
import { downloadCrawlExport } from '@/lib/site-health/download';

export function IssuesExport({
  workspaceId,
  crawlId,
  filters,
}: Readonly<{ workspaceId: string; crawlId: string; filters: IssueExportParams }>) {
  return (
    <ExportAction
      scope="page"
      formats={['csv', 'md']}
      onExport={(format) =>
        downloadCrawlExport({ crawlId, format, view: 'issues', filters }, { workspaceId })
      }
    />
  );
}

export function IssuePagesExport({
  workspaceId,
  crawlId,
  groupId,
}: Readonly<{ workspaceId: string; crawlId: string; groupId: string }>) {
  return (
    <ExportAction
      scope="table"
      formats={['csv']}
      onExport={(format) =>
        downloadCrawlExport(
          { crawlId, format, view: 'issue', filters: { group_id: groupId } },
          { workspaceId },
        )
      }
    />
  );
}
