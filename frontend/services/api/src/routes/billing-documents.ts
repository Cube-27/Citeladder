import { billingInvoiceListSchema } from '@citeladder/contracts/billing';
import { z } from 'zod';

import { listInvoices, readInvoice, renderInvoicePdf } from '../billing/invoices.ts';
import { executiveReport } from '../projects/executive-report.ts';
import { defineGetRoute } from './define.ts';

const uuid = { scalar: { kind: 'uuid' }, required: true } as const;
const pdf = z.string().meta({ format: 'binary' });
const attachmentHeaders = (filename: string) => ({
  'Content-Type': 'application/pdf',
  'Content-Disposition': `attachment; filename="${filename}"`,
  'X-Content-Type-Options': 'nosniff',
});

export const billingDocumentRoutes = [
  defineGetRoute({
    family: 'billing-documents',
    path: '/api/v1/billing/invoices',
    capability: 'manage_billing',
    params: {
      path: {},
      query: { limit: { scalar: { kind: 'int', ge: 1, le: 100 }, default: 50 } },
    },
    response: billingInvoiceListSchema,
    handle: ({ c, db }, { query }) => listInvoices(db, c.get('workspace').workspaceId, query.limit),
  }),
  defineGetRoute({
    family: 'billing-documents',
    path: '/api/v1/billing/invoices/{invoice_id}/pdf',
    capability: 'manage_billing',
    params: { path: { invoice_id: uuid }, query: {} },
    response: pdf,
    raw: true,
    async handle({ c, db }, { path }) {
      const invoice = await readInvoice(db, c.get('workspace').workspaceId, path.invoice_id);
      const bytes = await renderInvoicePdf(invoice);
      const filename = `${invoice.receipt_number.replaceAll(/[^a-zA-Z0-9_-]/gu, '-')}.pdf`;
      return c.body(new Uint8Array(bytes).buffer, 200, attachmentHeaders(filename));
    },
  }),
  defineGetRoute({
    family: 'executive-report',
    path: '/api/v1/projects/{project_id}/reports/executive.pdf',
    params: { path: { project_id: uuid }, query: { audit_id: { scalar: { kind: 'uuid' } } } },
    response: pdf,
    raw: true,
    async handle({ c, db }, { path, query }) {
      const result = await executiveReport(
        db,
        { workspaceId: c.get('workspace').workspaceId, projectId: path.project_id },
        query.audit_id,
      );
      return c.body(new Uint8Array(result.bytes).buffer, 200, attachmentHeaders(result.filename));
    },
  }),
];
