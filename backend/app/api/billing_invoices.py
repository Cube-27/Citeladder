"""Workspace-authorized reads of persisted paid receipts."""

from __future__ import annotations

import uuid
from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, Query, Response
from fastapi import Path as PathParam
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import WorkspaceContext, get_db, require_active_workspace_billing
from app.core.http_errors import raise_api_error
from app.domain.billing.invoice_pdf import render_invoice_pdf
from app.domain.billing.invoice_schemas import (
    BillingInvoiceResponse,
    BillingInvoicesResponse,
)
from app.domain.billing.schemas import MoneyResponse
from app.domain.billing.service import workspace_account
from app.models.billing_invoice import BillingInvoice

router = APIRouter(tags=["billing"])
BillingWorkspace = Annotated[
    WorkspaceContext, Depends(require_active_workspace_billing)
]
Session = Annotated[AsyncSession, Depends(get_db)]


def _dict(value: object) -> dict[str, Any]:
    return cast(dict[str, Any], value) if isinstance(value, dict) else {}


def _money(currency: str, amounts: dict[str, Any], key: str) -> MoneyResponse:
    value = amounts.get(key)
    if type(value) is not int or value < 0:
        raise RuntimeError("persisted invoice amount is invalid")
    return MoneyResponse(currency=cast(Any, currency), amount_minor=value)


def _summary(row: BillingInvoice) -> BillingInvoiceResponse:
    amounts = _dict(row.payload.get("amounts"))
    return BillingInvoiceResponse(
        invoice_id=row.id,
        invoice_number=row.invoice_number,
        receipt_number=row.receipt_number,
        paid_at=row.paid_at,
        amount_paid=MoneyResponse(
            currency=cast(Any, row.currency), amount_minor=row.total_amount_minor
        ),
        subtotal_price=_money(row.currency, amounts, "subtotal_minor"),
        discount=_money(row.currency, amounts, "discount_minor"),
        taxable_value=_money(row.currency, amounts, "taxable_minor"),
        tax_treatment=cast(Any, row.tax_treatment),
        tax_rate=str(amounts.get("tax_rate", "0")),
        cgst=_money(row.currency, amounts, "cgst_minor"),
        sgst=_money(row.currency, amounts, "sgst_minor"),
        igst=_money(row.currency, amounts, "igst_minor"),
    )


@router.get("/billing/invoices", response_model=BillingInvoicesResponse)
async def get_billing_invoices(
    ctx: BillingWorkspace,
    session: Session,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> BillingInvoicesResponse:
    account = await workspace_account(
        session, workspace_id=ctx.workspace_id, user=ctx.user
    )
    rows = (
        await session.scalars(
            select(BillingInvoice)
            .where(BillingInvoice.billing_account_id == account.id)
            .order_by(BillingInvoice.paid_at.desc(), BillingInvoice.id.desc())
            .limit(limit)
        )
    ).all()
    return BillingInvoicesResponse(invoices=[_summary(row) for row in rows])


@router.get("/billing/invoices/{invoice_id}/pdf")
async def get_billing_invoice_pdf(
    invoice_id: Annotated[uuid.UUID, PathParam()],
    ctx: BillingWorkspace,
    session: Session,
) -> Response:
    account = await workspace_account(
        session, workspace_id=ctx.workspace_id, user=ctx.user
    )
    invoice = await session.scalar(
        select(BillingInvoice).where(
            BillingInvoice.id == invoice_id,
            BillingInvoice.billing_account_id == account.id,
        )
    )
    if invoice is None:
        raise_api_error(404, "Receipt not found")
    filename = invoice.receipt_number.replace("/", "-") + ".pdf"
    return Response(
        content=render_invoice_pdf(invoice),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
