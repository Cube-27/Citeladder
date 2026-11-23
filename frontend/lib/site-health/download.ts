import { apiClient, type ApiRequestOptions } from '@/lib/api/client';
import { siteHealthApi, type ExportFilters } from '@/lib/api/site-health';
import { saveBlob } from '@/lib/download';

export type ExportView = 'inventory' | 'pages' | 'issues' | 'issue' | 'architecture';
export type ExportFormat = 'csv' | 'md';

export function exportFilename(crawlId: string, format: ExportFormat, view: ExportView): string {
  const shortId = crawlId.slice(0, 8);
  if (format === 'csv') return `site-health-${view}-${shortId}.csv`;
  return view === 'inventory' ? `site-health-${shortId}.md` : `site-health-${view}-${shortId}.md`;
}

export async function downloadCrawlExport(
  {
    crawlId,
    format,
    view = 'inventory',
    filters,
  }: Readonly<{
    crawlId: string;
    format: ExportFormat;
    view?: ExportView;
    filters?: ExportFilters;
  }>,
  options?: ApiRequestOptions,
): Promise<void> {
  const absolutePath = siteHealthApi.exportUrl(crawlId, format, view, filters);
  const path = absolutePath.replace(/^\/api\/v1/, '');
  const blob = await apiClient.getBlob(path, options);
  saveBlob(blob, exportFilename(crawlId, format, view));
}
