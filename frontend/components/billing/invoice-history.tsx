'use client';

import { useState } from 'react';

import { billingApi, type BillingInvoice } from '@/lib/api/billing';
import { formatMoney } from '@/lib/billing/catalog';
import { DisplayTime } from '@/components/ui/display-time';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { Stack } from '@/components/ui/layout';
import { ClampText, TableCell, TableRow } from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { ICONS } from '@/lib/icons';
import { useActiveWorkspaceId } from '@/lib/project/project-context';
import { saveBlob } from '@/lib/download';

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'document', label: 'Document' },
  { key: 'paid', label: 'Date', width: 'date' },
  { key: 'amount', label: 'Amount', width: 'figure', numeric: true },
  { key: 'download', label: 'Download', width: 'name', numeric: true, hideLabel: true },
];

function invoicesState(loading: boolean, count: number): DataTableState | undefined {
  if (loading) return { kind: 'loading', label: 'Loading billing documents…' };
  if (count > 0) return undefined;
  return {
    kind: 'empty',
    icon: ICONS.billing,
    headingLevel: 3,
    heading: 'No invoices have been issued yet.',
  };
}

function downloadLabel(invoice: BillingInvoice, downloading: string | null): string {
  if (downloading === invoice.invoice_id) return 'Preparing…';
  return invoice.status === 'credited' ? 'Download credit note' : 'Download receipt';
}

export function InvoiceHistory({
  invoices,
  loading,
  error,
}: Readonly<{
  invoices: BillingInvoice[];
  loading: boolean;
  error: boolean;
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
      {error ? <Alert tone="danger">Receipts could not be loaded.</Alert> : null}
      {downloadError ? <Alert tone="danger">Receipt download failed. Please retry.</Alert> : null}
      {error ? null : (
        <DataTable
          title="Invoices, receipts and credit notes"
          columns={COLUMNS}
          state={invoicesState(loading, invoices.length)}
        >
          {invoices.map((invoice) => (
            <TableRow key={invoice.invoice_id}>
              <TableCell>
                <div className="grid min-w-0">
                  <ClampText lines={1} className={textRole('emphasis')}>
                    {invoice.status === 'credited'
                      ? `Credit note ${invoice.invoice_number} · Against ${invoice.original_invoice_number ?? ''}`
                      : `Invoice ${invoice.invoice_number} · Receipt ${invoice.receipt_number}`}
                  </ClampText>
                  <ClampText lines={1} className={textRole('caption')}>
                    GST: {invoice.tax_treatment.replaceAll('_', ' ')} · CGST{' '}
                    {formatMoney(invoice.cgst, 2)} · SGST {formatMoney(invoice.sgst, 2)} · IGST{' '}
                    {formatMoney(invoice.igst, 2)}
                  </ClampText>
                </div>
              </TableCell>
              <TableCell>
                {invoice.status === 'credited' ? 'Credited' : 'Paid'}{' '}
                <DisplayTime value={invoice.paid_at} dateOnly />
              </TableCell>
              <TableCell numeric>{formatMoney(invoice.amount_paid, 2)}</TableCell>
              <TableCell numeric>
                <Button
                  variant="secondary"
                  disabled={downloading === invoice.invoice_id}
                  onClick={() => void download(invoice)}
                >
                  {downloadLabel(invoice, downloading)}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      )}
    </Stack>
  );
}
