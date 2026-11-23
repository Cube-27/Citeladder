import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Inline } from '@/components/ui/layout';
import { useToast } from '@/components/ui/toast';
import type { IssueExportParams } from '@/lib/api/site-health';
import { Download } from '@/lib/icons';
import { downloadCrawlExport, type ExportFormat } from '@/lib/site-health/download';

const FORMATS: readonly { format: ExportFormat; label: string }[] = [
  { format: 'csv', label: 'Export CSV' },
  { format: 'md', label: 'Export Markdown' },
];

export function IssuesExport({
  workspaceId,
  crawlId,
  filters,
}: Readonly<{ workspaceId: string; crawlId: string; filters: IssueExportParams }>) {
  const { notify } = useToast();
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const run = async (format: ExportFormat) => {
    setExporting(format);
    try {
      await downloadCrawlExport({ crawlId, format, view: 'issues', filters }, { workspaceId });
    } catch {
      notify('Export failed', undefined, { tone: 'negative' });
    } finally {
      setExporting(null);
    }
  };
  return (
    <Inline>
      {FORMATS.map(({ format, label }) => (
        <Button
          key={format}
          variant="secondary"
          onClick={() => void run(format)}
          pending={exporting === format}
          disabled={exporting !== null}
        >
          <Icon icon={Download} />
          {label}
        </Button>
      ))}
    </Inline>
  );
}

export function IssuePagesExport({
  workspaceId,
  crawlId,
  groupId,
}: Readonly<{ workspaceId: string; crawlId: string; groupId: string }>) {
  const { notify } = useToast();
  const [exporting, setExporting] = useState(false);
  const run = async () => {
    setExporting(true);
    try {
      await downloadCrawlExport(
        { crawlId, format: 'csv', view: 'issue', filters: { group_id: groupId } },
        { workspaceId },
      );
    } catch {
      notify('Export failed', undefined, { tone: 'negative' });
    } finally {
      setExporting(false);
    }
  };
  return (
    <Button variant="secondary" onClick={() => void run()} pending={exporting}>
      <Icon icon={Download} />
      Export CSV
    </Button>
  );
}
