import { useState } from 'react';

import { billingApi, type BillingInvoice } from '@/lib/api/billing';
import { formatMoney } from '@/lib/billing/catalog';
import { DisplayTime } from '@/components/ui/display-time';

import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { Stack } from '@/components/ui/layout';
import { ClampText, TableActionsCell, TableCell, TableRow } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { ICONS } from '@/lib/icons';
import { useActiveWorkspaceId } from '@/lib/project/project-context';
import { saveBlob } from '@/lib/download';
import { Notice, readErrorProps, type RetryableRead } from '@/components/ui/notice';
import { Value } from '@/components/ui/value';

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'document', label: 'Document' },
  { key: 'paid', label: 'Date', width: 'status', numeric: true },
  { key: 'tax', label: 'GST', width: 'category' },
  { key: 'amount', label: 'Amount', width: 'figure', numeric: true },
  { key: 'download', label: 'Download', width: 'name', trailing: true, hideLabel: true },
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
    return { kind: 'error', ...readErrorProps(read), fallback: 'Receipts could not be loaded.' };
  }
  if (read.isLoading) return { kind: 'loading', label: 'Loading billing documents…' };
  if (count > 0) return undefined;
  return {
    kind: 'empty',
    icon: ICONS.billing,
    headingLevel: 3,
    heading: 'No invoices have been issued yet',
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
    <Stack gap="compact">
      {downloadError ? (
        <Notice tone="negative">Receipt download failed. Please retry.</Notice>
      ) : null}
      <DataTable
        title="Invoices"
        description="Invoices with their receipts, and any credit notes."
        columns={COLUMNS}
        minWidth="lg"
        state={invoicesState(read, invoices.length)}
      >
        {invoices.map((invoice) => (
          <TableRow key={invoice.invoice_id}>
            <TableCell>
              <ClampText lines={1} className={textRole('emphasis')}>
                {invoice.status === 'credited'
                  ? `Credit note ${invoice.invoice_number} · Against ${invoice.original_invoice_number ?? ''}`
                  : `Invoice ${invoice.invoice_number} · Receipt ${invoice.receipt_number}`}
              </ClampText>
            </TableCell>
            {/* The date alone, aligned as every date column is; the
                  document names whether it was paid or credited. */}
            <TableCell numeric>
              <DisplayTime value={invoice.paid_at} dateOnly />
            </TableCell>
            <TableCell>
              <ClampText lines={1}>{taxBreakdown(invoice)}</ClampText>
            </TableCell>
            <TableCell numeric>
              <Value value={formatMoney(invoice.amount_paid, 2)} />
            </TableCell>
            <TableActionsCell>
              <Button
                variant="secondary"
                disabled={downloading === invoice.invoice_id}
                onClick={() => void download(invoice)}
              >
                {downloadLabel(invoice, downloading)}
              </Button>
            </TableActionsCell>
          </TableRow>
        ))}
      </DataTable>
    </Stack>
  );
}
