"""Safe persisted paid-receipt read contracts."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.domain.billing.schemas import MoneyResponse


class BillingInvoiceResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    invoice_id: uuid.UUID
    invoice_number: str
    receipt_number: str
    status: Literal["paid"] = "paid"
    paid_at: datetime
    amount_paid: MoneyResponse
    subtotal_price: MoneyResponse
    discount: MoneyResponse
    taxable_value: MoneyResponse
    tax_treatment: Literal["CGST_SGST", "IGST", "EXPORT_ZERO_RATED"]
    tax_rate: str
    cgst: MoneyResponse
    sgst: MoneyResponse
    igst: MoneyResponse
    # Deliberately null: provider payment identities remain private persistence.
    payment_id: None = None


class BillingInvoicesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    invoices: list[BillingInvoiceResponse]
