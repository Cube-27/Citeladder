/** Workspace-scoped receipt projections; settlement still owns immutable issuance. */
import {
  billingInvoiceSchema,
  moneySchema,
  taxTreatmentSchema,
} from '@citeladder/contracts/billing';
import type { Selectable } from 'kysely';
import { z } from 'zod';

import type { Database } from '../db/database.ts';
import { jsonObject } from '../db/json.ts';
import { notFound } from '../errors.ts';
import type { BillingInvoices } from '../generated/db-schema.ts';
import { PdfReport } from './pdf.ts';

type Invoice = Selectable<BillingInvoices>;
const minor = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text = z.string().nullable().optional();
const identity = z.object({
  legal_name: text,
  name: text,
  address: text,
  address_line1: text,
  city: text,
  postal_code: text,
  country_code: text,
  state_code: text,
  gstin: text,
  customer_gstin: text,
  email: text,
  lut_reference: text,
});
const payloadSchema = z.object({
  seller: identity,
  customer: identity,
  line: z.object({
    description: z.string(),
    quantity: z.number().int().positive(),
    unit_price_minor: minor,
    amount_minor: minor,
    sac: text,
    period_start: z.string().nullable().optional(),
    period_end: z.string().nullable().optional(),
  }),
  amounts: z.object({
    subtotal_minor: minor,
    discount_minor: minor,
    taxable_minor: minor,
    cgst_minor: minor,
    sgst_minor: minor,
    igst_minor: minor,
    tax_minor: minor,
    total_minor: minor,
    currency: moneySchema.shape.currency,
    tax_rate: z.string().regex(/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/u),
    tax_treatment: taxTreatmentSchema,
  }),
  payment: z.object({ method: z.string() }),
  original_invoice_number: text,
});

function payload(invoice: Invoice) {
  const value = payloadSchema.parse(jsonObject(invoice.payload, 'billing_invoices.payload'));
  const amounts = value.amounts;
  if (
    amounts.currency !== invoice.currency ||
    amounts.total_minor !== invoice.total_amount_minor ||
    amounts.tax_treatment !== invoice.tax_treatment ||
    amounts.subtotal_minor - amounts.discount_minor !== amounts.taxable_minor ||
    amounts.cgst_minor + amounts.sgst_minor + amounts.igst_minor !== amounts.tax_minor ||
    amounts.taxable_minor + amounts.tax_minor !== amounts.total_minor ||
    // Each treatment renders only its own tax rows, so no other component may carry tax.
    (amounts.tax_treatment === 'IGST' && amounts.cgst_minor + amounts.sgst_minor !== 0) ||
    (amounts.tax_treatment === 'CGST_SGST' && amounts.igst_minor !== 0) ||
    (amounts.tax_treatment === 'EXPORT_ZERO_RATED' && amounts.tax_minor !== 0)
  ) {
    throw new TypeError('Persisted invoice amounts are inconsistent');
  }
  return value;
}

function summary(invoice: Invoice) {
  const value = payload(invoice);
  const amounts = value.amounts;
  const money = (amount: number) =>
    moneySchema.parse({ currency: invoice.currency, amount_minor: amount });
  return billingInvoiceSchema.parse({
    invoice_id: invoice.id,
    invoice_number: invoice.invoice_number,
    receipt_number: invoice.receipt_number,
    document_kind: invoice.document_kind,
    status: invoice.document_kind === 'credit_note' ? 'credited' : 'paid',
    description: value.line.description,
    original_invoice_number: value.original_invoice_number ?? null,
    paid_at: invoice.paid_at.toISOString(),
    amount_paid: money(invoice.total_amount_minor),
    subtotal_price: money(amounts.subtotal_minor),
    discount: money(amounts.discount_minor),
    taxable_value: money(amounts.taxable_minor),
    tax_treatment: amounts.tax_treatment,
    tax_rate: amounts.tax_rate,
    cgst: money(amounts.cgst_minor),
    sgst: money(amounts.sgst_minor),
    igst: money(amounts.igst_minor),
    payment_id: null,
  });
}

/** Reads never provision: a workspace without a billing account has no receipts. */
async function accountId(db: Database, workspaceId: string): Promise<string | undefined> {
  const account = await db
    .selectFrom('billing_accounts')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  return account?.id;
}

export async function listInvoices(db: Database, workspaceId: string, limit: number) {
  const id = await accountId(db, workspaceId);
  if (id === undefined) return { invoices: [] };
  const invoices = await db
    .selectFrom('billing_invoices')
    .selectAll()
    .where('billing_account_id', '=', id)
    .orderBy('paid_at', 'desc')
    .orderBy('id', 'desc')
    .limit(limit)
    .execute();
  return { invoices: invoices.map(summary) };
}

export async function readInvoice(
  db: Database,
  workspaceId: string,
  invoiceId: string,
): Promise<Invoice> {
  const id = await accountId(db, workspaceId);
  if (id === undefined) throw notFound('Receipt');
  const invoice = await db
    .selectFrom('billing_invoices')
    .selectAll()
    .where('billing_account_id', '=', id)
    .where('id', '=', invoiceId)
    .executeTakeFirst();
  if (!invoice) throw notFound('Receipt');
  // The persisted enum is validated before it chooses a document or filename.
  summary(invoice);
  return invoice;
}

function address(value: z.infer<typeof identity>, customer = false): string {
  const rows = [
    value.name ?? value.legal_name,
    value.address_line1 ?? value.address,
    [value.city, value.postal_code].filter(Boolean).join(', '),
    value.country_code,
    value.email,
  ];
  if (value.gstin ?? value.customer_gstin)
    rows.push(`GSTIN: ${value.gstin ?? value.customer_gstin}`);
  if (customer && value.state_code)
    rows.push(`Place of supply: GST state code ${value.state_code}`);
  return rows.filter(Boolean).join('\n');
}

const date = (value: Date) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'long' }).format(value);
/** A frozen period that does not parse is shown as stored rather than failing the document. */
function periodDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : date(parsed);
}

/** A persisted decimal rate as an exact percentage (`0.28`, 50n → `14`); floats would print `14.000000000000002`. */
function percent(rate: string, multiplier: bigint): string {
  const [whole = '', fraction = ''] = rate.split('.');
  const digits = (BigInt(whole + fraction) * multiplier)
    .toString()
    .padStart(fraction.length + 1, '0');
  const point = digits.length - fraction.length;
  return `${digits.slice(0, point)}.${digits.slice(point)}`.replace(/\.?0*$/u, '');
}

export async function renderInvoicePdf(invoice: Invoice): Promise<Uint8Array> {
  const value = payload(invoice);
  const amounts = value.amounts;
  const credit = invoice.document_kind === 'credit_note';
  if (credit && !value.original_invoice_number)
    throw new TypeError('Credit note has no original invoice');
  const money = (amount: number) =>
    `${amounts.currency} ${(amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const report = await PdfReport.create(
    `${credit ? 'Credit note' : 'Receipt'} ${invoice.receipt_number}`,
    value.seller.legal_name ?? undefined,
  );
  report.title(credit ? 'Credit note' : 'Receipt');
  report.text(
    `Invoice: ${invoice.invoice_number}\nReceipt: ${invoice.receipt_number}\n${credit ? 'Issued' : 'Paid'}: ${date(invoice.paid_at)}`,
  );
  if (credit) report.text(`Against invoice: ${value.original_invoice_number}`);
  report.heading('Seller and customer');
  report.table(
    ['Seller', 'Bill to'],
    [[address(value.seller), address(value.customer, true)]],
    [1, 1],
  );
  report.heading(`${money(invoice.total_amount_minor)} ${credit ? 'credited' : 'paid'}`);
  const line = value.line;
  let description = line.description;
  if (line.sac) description += `\nSAC: ${line.sac}`;
  if (line.period_start && line.period_end)
    description += `\n${periodDate(line.period_start)} to ${periodDate(line.period_end)}`;
  report.table(
    ['Description', 'Qty', 'Unit price', 'Amount'],
    [[description, String(line.quantity), money(line.unit_price_minor), money(line.amount_minor)]],
    [6, 1, 2, 2],
  );
  const half = percent(amounts.tax_rate, 50n);
  const taxes =
    amounts.tax_treatment === 'CGST_SGST'
      ? [
          [`CGST (${half}%)`, money(amounts.cgst_minor)],
          [`SGST (${half}%)`, money(amounts.sgst_minor)],
        ]
      : [
          [
            amounts.tax_treatment === 'IGST'
              ? `IGST (${percent(amounts.tax_rate, 100n)}%)`
              : 'GST - export of service (zero-rated)',
            money(amounts.igst_minor),
          ],
        ];
  report.heading('Totals');
  report.table(
    ['Description', 'Amount'],
    [
      ['Subtotal', money(amounts.subtotal_minor)],
      ['Discount', money(amounts.discount_minor)],
      ['Taxable value', money(amounts.taxable_minor)],
      ...taxes,
      ['Total', money(amounts.total_minor)],
      [credit ? 'Amount credited' : 'Amount paid', money(invoice.total_amount_minor)],
    ],
    [3, 1],
  );
  report.heading(credit ? 'Refund' : 'Payment history');
  report.table(
    ['Method', 'Date', 'Amount', 'Receipt'],
    [
      [
        value.payment.method,
        date(invoice.paid_at),
        money(invoice.total_amount_minor),
        invoice.receipt_number,
      ],
    ],
    [2, 3, 2, 3],
  );
  if (invoice.document_kind === 'export_receipt' && value.seller.lut_reference)
    report.text(`Export under LUT reference: ${value.seller.lut_reference}`);
  return report.save();
}
