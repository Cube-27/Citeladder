import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Inline } from '@/components/ui/layout';
import { useToast } from '@/components/ui/toast';
import { Download } from '@/lib/icons';

type ExportFormat = 'csv' | 'md';
type ExportScope = 'page' | 'table';

const FORMAT_LABEL: Record<ExportFormat, string> = {
  csv: 'Export CSV',
  md: 'Export Markdown',
};

export function ExportAction({
  scope,
  formats,
  onExport,
  disabled = false,
}: Readonly<{
  scope: ExportScope;
  formats: readonly [ExportFormat, ...ExportFormat[]];
  onExport: (format: ExportFormat) => Promise<void>;
  disabled?: boolean;
}>) {
  const { notify } = useToast();
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const run = async (format: ExportFormat) => {
    setExporting(format);
    try {
      await onExport(format);
    } catch {
      notify('Export failed', undefined, { tone: 'negative' });
    } finally {
      setExporting(null);
    }
  };
  return (
    <Inline data-export-scope={scope}>
      {formats.map((format) => (
        <Button
          key={format}
          variant="secondary"
          onClick={() => void run(format)}
          pending={exporting === format}
          disabled={disabled || exporting !== null}
        >
          <Icon icon={Download} />
          {FORMAT_LABEL[format]}
        </Button>
      ))}
    </Inline>
  );
}
