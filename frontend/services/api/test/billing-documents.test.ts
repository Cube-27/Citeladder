import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';
import type { Selectable } from 'kysely';

import { createApp } from '../src/app.ts';
import { renderInvoicePdf } from '../src/billing/invoices.ts';
import type { BillingInvoices } from '../src/generated/db-schema.ts';
import { pdfText } from './pdf-text.ts';
import { billingAccount } from './prompt-fixtures.ts';
import { asOwner, Fixtures, sessionToken, testConfig, testDatabase } from './support.ts';

const paidAt = new Date('2026-09-08T21:30:00Z');
function invoice(
  accountId: string,
  kind: 'gst_tax_receipt' | 'export_receipt' | 'credit_note' = 'gst_tax_receipt',
): Selectable<BillingInvoices> {
  const exported = kind === 'export_receipt';
  return {
    id: randomUUID(),
    billing_account_id: accountId,
    payment_id: randomUUID(),
    invoice_number: `CL/2627/${randomUUID().slice(0, 6)}`,
    receipt_number: 'CLR/2627/000001',
    financial_year: '2026-27',
    document_kind: kind,
    invoice_date: new Date('2026-09-09T00:00:00Z'),
    paid_at: paidAt,
    created_at: paidAt,
    currency: exported ? 'USD' : 'INR',
    total_amount_minor: exported ? 100000 : 118000,
    tax_treatment: exported ? 'EXPORT_ZERO_RATED' : 'IGST',
    tax_policy_version: 1,
    payload_sha256: 'a'.repeat(64),
    payload: {
      seller: {
        legal_name: 'CiteLadder',
        address: '1 Test Street',
        gstin: '27ABCDE1234F1Z5',
        lut_reference: 'LUT-fixture',
      },
      customer: {
        name: 'José नाम',
        address_line1: '55 Test Road',
        city: 'Bengaluru',
        postal_code: '560001',
        state_code: exported ? null : '29',
        customer_gstin: null,
        country_code: exported ? 'US' : 'IN',
        email: 'buyer@example.test',
      },
      line: {
        description: 'CiteLadder Tier 1 subscription',
        quantity: 1,
        unit_price_minor: 100000,
        amount_minor: 100000,
        sac: '998313',
        period_start: '2026-09-08T00:00:00Z',
        period_end: '2026-10-08T00:00:00Z',
      },
      amounts: {
        subtotal_minor: 100000,
        discount_minor: 0,
        taxable_minor: 100000,
        cgst_minor: 0,
        sgst_minor: 0,
        igst_minor: exported ? 0 : 18000,
        tax_minor: exported ? 0 : 18000,
        total_minor: exported ? 100000 : 118000,
        currency: exported ? 'USD' : 'INR',
        tax_rate: exported ? '0' : '0.18',
        tax_treatment: exported ? 'EXPORT_ZERO_RATED' : 'IGST',
      },
      payment: { method: 'upi', provider_secret: 'private-provider-secret' },
      ...(kind === 'credit_note' ? { original_invoice_number: 'CL/2627/000099' } : {}),
    },
  };
}

describe('persisted billing documents', () => {
  const config = testConfig();
  const db = testDatabase(config);
  const fixtures = new Fixtures(db);
  const accounts: string[] = [];
  afterAll(async () => {
    if (accounts.length) {
      await db.deleteFrom('billing_invoices').where('billing_account_id', 'in', accounts).execute();
      await asOwner((owner) =>
        owner.deleteFrom('billing_payments').where('billing_account_id', 'in', accounts).execute(),
      );
    }
    await fixtures.cleanup();
    await db.destroy();
  });
  const app = createApp(config, db);
  async function tenant() {
    const userId = await fixtures.user();
    const workspaceId = await fixtures.ownedWorkspace(userId);
    const accountId = await billingAccount(db, workspaceId);
    accounts.push(accountId);
    return { userId, workspaceId, accountId };
  }
  async function headers(userId: string, workspaceId: string) {
    return {
      cookie: `${config.session.cookieName}=${await sessionToken({ sub: userId, ver: 0 })}`,
      'x-workspace-id': workspaceId,
    };
  }
  async function persist(row: Selectable<BillingInvoices>) {
    await db
      .insertInto('billing_payments')
      .values({
        id: row.payment_id,
        billing_account_id: row.billing_account_id,
        provider: 'razorpay',
        provider_mode: 'test',
        receipt_kind: 'payment',
        external_payment_id: `pay_${row.payment_id}`,
        amount_minor: row.total_amount_minor,
        currency: row.currency,
        payment_method: 'upi',
        status: 'paid',
        paid_at: paidAt,
        receipt_sha256: 'a'.repeat(64),
        created_at: paidAt,
      })
      .execute();
    await db.insertInto('billing_invoices').values(row).execute();
  }
  it('lists and downloads only the active workspace account, including a credit note', async () => {
    const owner = await tenant();
    const otherWorkspace = await fixtures.joinedWorkspace(owner.userId);
    await billingAccount(db, otherWorkspace);
    const member = await fixtures.user();
    await fixtures.member(owner.workspaceId, member, 'member');
    const outsider = await fixtures.user();
    const receipt = invoice(owner.accountId);
    receipt.receipt_number = 'CLR/2627/000001"\r\nInjected';
    const note = invoice(owner.accountId, 'credit_note');
    note.paid_at = new Date(paidAt.getTime() + 1000);
    await persist(receipt);
    await persist(note);
    const ownerHeaders = await headers(owner.userId, owner.workspaceId);
    const listed = await app.request('/api/v1/billing/invoices?limit=1', { headers: ownerHeaders });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({
      invoices: [
        {
          invoice_id: note.id,
          status: 'credited',
          original_invoice_number: 'CL/2627/000099',
          amount_paid: { currency: 'INR', amount_minor: 118000 },
        },
      ],
    });
    const path = `/api/v1/billing/invoices/${receipt.id}/pdf`;
    const response = await app.request(path, { headers: ownerHeaders });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="CLR-2627-000001---Injected.pdf"',
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    const pages = await pdfText(bytes);
    const text = pages.join(' ');
    expect(text).toContain('INR 1,180.00');
    const embedded = Buffer.from(bytes).toString('latin1');
    expect(embedded).toMatch(/\/BaseFont \/[A-Z]{6}\+JetBrainsMono-Regular/u);
    expect(embedded).toMatch(/\/BaseFont \/[A-Z]{6}\+Inter-Regular/u);
    expect(text).toContain('IGST (18%)');
    expect(text).toContain(`Document ${receipt.id}`);
    expect(text).toContain('9 September 2026');
    expect(text).toMatch(/José\s+नाम/u);
    expect(text).not.toContain('private-provider-secret');
    expect(
      (await app.request(path, { headers: await headers(member, owner.workspaceId) })).status,
    ).toBe(403);
    expect(
      (
        await app.request('/api/v1/billing/invoices', {
          headers: await headers(member, owner.workspaceId),
        })
      ).status,
    ).toBe(403);
    expect(
      (await app.request(path, { headers: await headers(outsider, owner.workspaceId) })).status,
    ).toBe(404);
    expect(
      (await app.request(path, { headers: await headers(owner.userId, otherWorkspace) })).status,
    ).toBe(404);
    expect(
      (await app.request('/api/v1/billing/invoices?limit=0', { headers: ownerHeaders })).status,
    ).toBe(422);
    expect(
      await db
        .selectFrom('billing_invoices')
        .select('payload')
        .where('id', '=', receipt.id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ payload: receipt.payload });
  });
  it.each(['gst_tax_receipt', 'export_receipt', 'credit_note'] as const)(
    'renders frozen %s terms and pages long text without truncation',
    async (kind) => {
      const row = invoice(randomUUID(), kind);
      const payload = row.payload as Record<string, Record<string, unknown>>;
      if (kind === 'gst_tax_receipt') {
        row.tax_treatment = 'CGST_SGST';
        Object.assign(payload.amounts!, {
          tax_treatment: 'CGST_SGST',
          tax_rate: '0.28',
          cgst_minor: 9000,
          sgst_minor: 9000,
          igst_minor: 0,
        });
      }
      payload.line!.description = `${'Long reviewed description '.repeat(180)}Final description marker`;
      const bytes = await renderInvoicePdf(row);
      const pages = await pdfText(bytes);
      expect(pages.length).toBeGreaterThan(1);
      expect(pages[0]).toContain('Long reviewed description');
      expect(pages.join(' ')).toContain('Final description marker');
      expect(pages.join(' ')).toContain(
        kind === 'credit_note' ? 'Against invoice: CL/2627/000099' : 'Receipt',
      );
      if (kind === 'export_receipt') expect(pages.join(' ')).toContain('LUT-fixture');
      if (kind === 'gst_tax_receipt') {
        expect(pages.join(' ')).toContain('CGST (14%)');
        expect(pages.join(' ')).toContain('SGST (14%)');
      }
    },
  );
  it('denies a workspace without access authority without provisioning one', async () => {
    const userId = await fixtures.user();
    const workspaceId = await fixtures.ownedWorkspace(userId, { access: false });
    const requestHeaders = await headers(userId, workspaceId);
    const listed = await app.request('/api/v1/billing/invoices', { headers: requestHeaders });
    expect(listed.status).toBe(403);
    expect(await listed.json()).toMatchObject({ error: { code: 'access_unresolved' } });
    const download = `/api/v1/billing/invoices/${randomUUID()}/pdf`;
    expect((await app.request(download, { headers: requestHeaders })).status).toBe(403);
    expect(
      await db
        .selectFrom('billing_accounts')
        .select('id')
        .where('workspace_id', '=', workspaceId)
        .execute(),
    ).toEqual([]);
  });
  it('rejects inconsistent persisted amounts rather than publishing guessed totals', async () => {
    const row = invoice(randomUUID());
    row.total_amount_minor += 1;
    await expect(renderInvoicePdf(row)).rejects.toThrow('inconsistent');
    const misfiled = invoice(randomUUID());
    Object.assign((misfiled.payload as Record<string, Record<string, unknown>>).amounts!, {
      cgst_minor: 9000,
      igst_minor: 9000,
    });
    await expect(renderInvoicePdf(misfiled)).rejects.toThrow('inconsistent');
  });
});
