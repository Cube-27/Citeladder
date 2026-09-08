'use client';

import { useState } from 'react';

import { billingApi, type BillingInvoice } from '@/lib/api/billing';
import { formatMoney } from '@/lib/billing/catalog';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { eyebrowClasses } from '@/components/ui/eyebrow';
import { panelClasses } from '@/components/ui/panel';
import { Skeleton } from '@/components/ui/skeleton';
import { textRole } from '@/components/ui/typography';

export function InvoiceHistory({
  invoices,
  loading,
  error,
}: Readonly<{
  invoices: BillingInvoice[];
  loading: boolean;
  error: boolean;
}>) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState(false);
  const download = async (invoice: BillingInvoice) => {
    setDownloading(invoice.invoice_id);
    setDownloadError(false);
    try {
      const blob = await billingApi.invoicePdf(invoice.invoice_id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${invoice.invoice_number || invoice.receipt_number}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <section className={panelClasses({}, 'grid gap-3')} aria-label="Payment history">
      <div>
        <p className={eyebrowClasses}>Payment history</p>
        <h2 className={textRole('bodyStrong', 'tracking-tight')}>Paid receipts</h2>
      </div>
      {error ? <Alert tone="danger">Receipts could not be loaded.</Alert> : null}
      {downloadError ? <Alert tone="danger">Receipt download failed. Please retry.</Alert> : null}
      {loading ? <Skeleton className="h-16 w-full" /> : null}
      {!loading && !error && invoices.length === 0 ? (
        <p className={textRole('meta')}>No paid receipts have been issued.</p>
      ) : null}
      <div className="grid gap-2">
        {invoices.map((invoice) => (
          <div
            key={invoice.invoice_id}
            className="border-border-subtle flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border p-3"
          >
            <div className="grid gap-1 text-sm">
              <span className={textRole('emphasis')}>
                Invoice {invoice.invoice_number} · Receipt {invoice.receipt_number}
              </span>
              <span className="text-muted">
                Paid {new Date(invoice.paid_at).toLocaleDateString()} ·{' '}
                {formatMoney(invoice.amount_paid, 2)}
              </span>
              <span className="text-muted text-xs">
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
              {downloading === invoice.invoice_id ? 'Preparing…' : 'Download receipt'}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
