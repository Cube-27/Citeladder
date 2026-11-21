import { useState } from 'react';

import { billingApi, type BillingInvoice } from '@/lib/api/billing';
import { formatMoney } from '@/lib/billing/catalog';
import { DisplayTime } from '@/components/ui/display-time';

import { IconButton } from '@/components/ui/button';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { SettingsGroup } from '@/components/ui/setting-row';
import { ClampText } from '@/components/ui/clamp-text';
import { TableActionsCell, TableCell, TableRow } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { Download, ICONS } from '@/lib/icons';
import { useActiveWorkspaceId } from '@/lib/project/project-context';
import { saveBlob } from '@/lib/download';
import { Notice, readErrorProps, type RetryableRead } from '@/components/ui/notice';
import { Value } from '@/components/ui/value';

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'document', label: 'Document', kind: 'identity' },
  { key: 'paid', label: 'Date', kind: 'date', width: 'status' },
  { key: 'amount', label: 'Amount', kind: 'number' },
  { key: 'tax', label: 'GST', kind: 'text', width: 'category', priority: 'low' },
  { key: 'download', label: 'Download', kind: 'actions', width: 'action', hideLabel: true },
];

const TREATMENT_LABEL: Record<BillingInvoice['tax_treatment'], string> = {
  CGST_SGST: 'CGST + SGST',
  IGST: 'IGST',
  EXPORT_ZERO_RATED: 'Zero-rated export',
};

/**
 * The invoice's GST, once: the components it carries, each the server's own
 * figure (nothing is added here). A zero-rated export carries none.
 */
function taxBreakdown(invoice: BillingInvoice): string {
  const parts = (
    [
      ['CGST', invoice.cgst],
      ['SGST', invoice.sgst],
      ['IGST', invoice.igst],
    ] as const
  )
    .filter(([, value]) => value.amount_minor > 0)
    .map(([label, value]) => `${label} ${formatMoney(value, 2)}`);
  return parts.length > 0 ? parts.join(' · ') : TREATMENT_LABEL[invoice.tax_treatment];
}

type InvoicesRead = RetryableRead & Readonly<{ isError: boolean; isLoading: boolean }>;

function invoicesState(read: InvoicesRead, count: number): DataTableState | undefined {
  if (read.isError) {
    return {
      kind: 'error',
      title: "Couldn't load invoices",
      ...readErrorProps(read),
      fallback: 'Receipts could not be loaded.',
    };
  }
  if (read.isLoading) return { kind: 'loading', label: 'Loading invoices…' };
  if (count > 0) return undefined;
  return {
    kind: 'empty',
    icon: ICONS.billing,
    headingLevel: 3,
    heading: 'No invoices yet',
  };
}

function downloadLabel(invoice: BillingInvoice, downloading: string | null): string {
  if (downloading === invoice.invoice_id) return 'Preparing…';
  return invoice.status === 'credited' ? 'Download credit note' : 'Download receipt';
}

export function InvoiceHistory({
  invoices,
  read,
}: Readonly<{
  invoices: BillingInvoice[];
  read: InvoicesRead;
}>) {
  // The receipt belongs to a workspace, so the download names one: the
  // endpoint is workspace-scoped and would otherwise fall back to whatever
  // the ambient selection happened to be.
  const workspaceId = useActiveWorkspaceId();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState(false);
  const download = async (invoice: BillingInvoice) => {
    setDownloading(invoice.invoice_id);
    setDownloadError(false);
    try {
      const blob = await billingApi.invoicePdf(invoice.invoice_id, { workspaceId });
      saveBlob(blob, `${invoice.invoice_number || invoice.receipt_number}.pdf`);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(null);
    }
  };

  return (
    // The table is the named region; the group only heads it.
    <SettingsGroup title="Invoices" region={false}>
      {downloadError ? (
        <Notice tone="negative">Receipt download failed. Please retry.</Notice>
      ) : null}
      <DataTable label="Invoices" columns={COLUMNS} state={invoicesState(read, invoices.length)}>
        {invoices.map((invoice) => (
          <TableRow key={invoice.invoice_id}>
            <TableCell>
              <ClampText lines={1} className={textRole('emphasis')}>
                {invoice.status === 'credited'
                  ? `Credit note ${invoice.invoice_number} · Against ${invoice.original_invoice_number ?? ''}`
                  : `Invoice ${invoice.invoice_number} · Receipt ${invoice.receipt_number}`}
              </ClampText>
            </TableCell>
            <TableCell>
              <DisplayTime value={invoice.paid_at} dateOnly />
            </TableCell>
            <TableCell>
              <Value value={formatMoney(invoice.amount_paid, 2)} />
            </TableCell>
            <TableCell>
              <ClampText lines={1}>{taxBreakdown(invoice)}</ClampText>
            </TableCell>
            <TableActionsCell>
              <IconButton
                icon={Download}
                label={downloadLabel(invoice, downloading)}
                disabled={downloading === invoice.invoice_id}
                onClick={() => void download(invoice)}
              />
            </TableActionsCell>
          </TableRow>
        ))}
      </DataTable>
    </SettingsGroup>
  );
}
