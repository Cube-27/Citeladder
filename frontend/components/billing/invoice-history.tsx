'use client';

import { useState } from 'react';

import { billingApi, type BillingInvoice } from '@/lib/api/billing';
import { formatMoney } from '@/lib/billing/catalog';
import { DisplayTime } from '@/components/ui/display-time';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { InlineEmpty } from '@/components/ui/inline-empty';
import { Stack } from '@/components/ui/layout';
import { Skeleton } from '@/components/ui/skeleton';
import { textRole } from '@/components/ui/typography';
import { EditorialSectionHeader, ledgerClasses } from '@/components/ui/workspace';
import { useActiveWorkspaceId } from '@/lib/project/project-context';
import { saveBlob } from '@/lib/download';

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
    <Stack as="section" gap="compact" aria-label="Billing documents">
      <Stack gap="tight">
        <p className={textRole('label')}>Billing documents</p>
        <EditorialSectionHeader title="Invoices, receipts and credit notes" />
      </Stack>
      {error ? <Alert tone="danger">Receipts could not be loaded.</Alert> : null}
      {downloadError ? <Alert tone="danger">Receipt download failed. Please retry.</Alert> : null}
      {loading ? <Skeleton className="h-16 w-full" /> : null}
      {!loading && !error && invoices.length === 0 ? (
        <InlineEmpty>No invoices have been issued yet.</InlineEmpty>
      ) : null}
      {invoices.length > 0 ? (
        <div className={ledgerClasses('boxed')}>
          {invoices.map((invoice) => (
            <div
              key={invoice.invoice_id}
              className="flex flex-wrap items-center justify-between gap-3 px-[var(--card-padding)] py-3"
            >
              <div className="type-body grid gap-1">
                <span className={textRole('emphasis')}>
                  {invoice.status === 'credited'
                    ? `Credit note ${invoice.invoice_number} · Against ${invoice.original_invoice_number ?? ''}`
                    : `Invoice ${invoice.invoice_number} · Receipt ${invoice.receipt_number}`}
                </span>
                <span className="text-muted">
                  {invoice.status === 'credited' ? 'Credited' : 'Paid'}{' '}
                  <DisplayTime value={invoice.paid_at} dateOnly /> ·{' '}
                  {formatMoney(invoice.amount_paid, 2)}
                </span>
                <span className="type-caption">
                  GST: {invoice.tax_treatment.replaceAll('_', ' ')} · CGST{' '}
                  {formatMoney(invoice.cgst, 2)} · SGST {formatMoney(invoice.sgst, 2)} · IGST{' '}
                  {formatMoney(invoice.igst, 2)}
                </span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={downloading === invoice.invoice_id}
                onClick={() => void download(invoice)}
              >
                {downloading === invoice.invoice_id
                  ? 'Preparing…'
                  : invoice.status === 'credited'
                    ? 'Download credit note'
                    : 'Download receipt'}
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </Stack>
  );
}
