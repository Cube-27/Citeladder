"""Render a polished, static paid receipt from persisted invoice facts."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from html import escape
from io import BytesIO
from typing import Any, cast

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Flowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.models.billing_invoice import BillingInvoice


def _dict(value: object) -> dict[str, Any]:
    return cast(dict[str, Any], value) if isinstance(value, dict) else {}


def _money(amount_minor: int, currency: str) -> str:
    return f"{currency} {amount_minor / 100:,.2f}"


def _date(value: object) -> str:
    if not isinstance(value, str):
        return ""
    try:
        parsed = datetime.fromisoformat(value)
        return f"{parsed.strftime('%B')} {parsed.day}, {parsed.year}"
    except ValueError:
        return value


def _safe(value: object) -> str:
    return escape(str(value or ""))


def _address_block(identity: dict[str, Any], *, customer: bool) -> str:
    display_name = identity.get("name") if customer else identity.get("legal_name")
    rows = [
        f"<b>{_safe(display_name)}</b>",
        _safe(identity.get("address_line1") if customer else identity.get("address")),
    ]
    if customer:
        rows.append(
            ", ".join(
                part
                for part in (
                    _safe(identity.get("city")),
                    _safe(identity.get("postal_code")),
                )
                if part
            )
        )
        state = identity.get("state_code")
        if state:
            rows.append(f"GST state code: {_safe(state)}")
            rows.append(f"Place of supply: GST state code {_safe(state)}")
        rows.append(
            "India"
            if identity.get("country_code") == "IN"
            else _safe(identity.get("country_code"))
        )
        rows.append(_safe(identity.get("email")))
        if identity.get("customer_gstin"):
            rows.append(f"GSTIN: {_safe(identity.get('customer_gstin'))}")
    else:
        if identity.get("email"):
            rows.append(_safe(identity.get("email")))
        rows.append(f"GSTIN: {_safe(identity.get('gstin'))}")
    return "<br/>".join(row for row in rows if row)


def _tax_rows(amounts: dict[str, Any], currency: str) -> list[list[object]]:
    rate = Decimal(str(amounts.get("tax_rate", "0"))) * 100
    taxable = int(amounts.get("taxable_minor", 0))
    treatment = amounts.get("tax_treatment")
    rows: list[list[object]] = []
    if treatment == "CGST_SGST":
        half = rate / 2
        rows.extend(
            [
                [
                    f"CGST ({half.normalize()}% on {_money(taxable, currency)})",
                    _money(int(amounts.get("cgst_minor", 0)), currency),
                ],
                [
                    f"SGST ({half.normalize()}% on {_money(taxable, currency)})",
                    _money(int(amounts.get("sgst_minor", 0)), currency),
                ],
            ]
        )
    elif treatment == "IGST":
        rows.append(
            [
                f"IGST ({rate.normalize()}% on {_money(taxable, currency)})",
                _money(int(amounts.get("igst_minor", 0)), currency),
            ]
        )
    else:
        rows.append(["GST - export of service (zero-rated)", _money(0, currency)])
    return rows


def render_invoice_pdf(invoice: BillingInvoice) -> bytes:
    """Return a one-page receipt PDF; it performs no I/O or state repair."""
    payload = _dict(invoice.payload)
    seller = _dict(payload.get("seller"))
    customer = _dict(payload.get("customer"))
    line = _dict(payload.get("line"))
    amounts = _dict(payload.get("amounts"))
    payment = _dict(payload.get("payment"))
    currency = str(amounts.get("currency", invoice.currency))
    styles = getSampleStyleSheet()
    body = ParagraphStyle(
        "ReceiptBody",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=14,
    )
    small = ParagraphStyle("ReceiptSmall", parent=body, fontSize=8, leading=11)
    right = ParagraphStyle("ReceiptRight", parent=body, alignment=TA_RIGHT)
    output = BytesIO()
    document = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"Paid receipt {invoice.receipt_number}",
        author=str(seller.get("legal_name", "CiteLadder")),
    )
    story: list[Flowable] = [
        Table(
            [
                [
                    Paragraph(
                        "<b>Receipt</b>",
                        ParagraphStyle(
                            "Title", parent=styles["Title"], fontSize=24, leading=28
                        ),
                    ),
                    Paragraph("<b>CiteLadder</b>", right),
                ]
            ],
            colWidths=[115 * mm, 55 * mm],
        ),
        Spacer(1, 8 * mm),
        Table(
            [
                [
                    Paragraph("<b>Invoice number</b>", small),
                    Paragraph(_safe(invoice.invoice_number), small),
                ],
                [
                    Paragraph("<b>Receipt number</b>", small),
                    Paragraph(_safe(invoice.receipt_number), small),
                ],
                [
                    Paragraph("<b>Date paid</b>", small),
                    Paragraph(_date(payload.get("paid_at")), small),
                ],
            ],
            colWidths=[30 * mm, 65 * mm],
        ),
        Spacer(1, 7 * mm),
        Table(
            [
                [
                    Paragraph(_address_block(seller, customer=False), body),
                    Paragraph(
                        "<b>Bill to</b><br/>" + _address_block(customer, customer=True),
                        body,
                    ),
                ]
            ],
            colWidths=[85 * mm, 85 * mm],
            style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]),
        ),
        Spacer(1, 12 * mm),
        Paragraph(
            "<b>"
            f"{_money(invoice.total_amount_minor, currency)} paid on "
            f"{_date(payload.get('paid_at'))}</b>",
            ParagraphStyle("Paid", parent=styles["Heading2"], fontSize=16, leading=20),
        ),
        Spacer(1, 10 * mm),
    ]
    description = _safe(line.get("description"))
    if line.get("sac"):
        description += f"<br/><font size='8'>SAC: {_safe(line.get('sac'))}</font>"
    if line.get("period_start") and line.get("period_end"):
        description += (
            f"<br/><font size='8'>{_date(line.get('period_start'))} to "
            f"{_date(line.get('period_end'))}</font>"
        )
    rate_label = (Decimal(str(amounts.get("tax_rate", "0"))) * 100).normalize()
    item_table = Table(
        [
            [
                Paragraph("Description", small),
                Paragraph("Qty", small),
                Paragraph("Unit price", small),
                Paragraph("Tax", small),
                Paragraph("Amount", small),
            ],
            [
                Paragraph(description, body),
                Paragraph(str(line.get("quantity", 1)), right),
                Paragraph(
                    _money(int(line.get("unit_price_minor", 0)), currency), right
                ),
                Paragraph(
                    f"{rate_label}%",
                    right,
                ),
                Paragraph(_money(int(line.get("amount_minor", 0)), currency), right),
            ],
        ],
        colWidths=[76 * mm, 14 * mm, 30 * mm, 18 * mm, 32 * mm],
    )
    item_table.setStyle(
        TableStyle(
            [
                ("LINEBELOW", (0, 0), (-1, 0), 0.6, colors.black),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.extend([item_table, Spacer(1, 8 * mm)])
    totals: list[list[object]] = [
        ["Subtotal", _money(int(amounts.get("subtotal_minor", 0)), currency)],
    ]
    discount = int(amounts.get("discount_minor", 0))
    if discount:
        totals.append(["Discount", f"- {_money(discount, currency)}"])
    totals.append(
        ["Total excluding tax", _money(int(amounts.get("taxable_minor", 0)), currency)]
    )
    totals.extend(_tax_rows(amounts, currency))
    totals.extend(
        [
            ["Total", _money(invoice.total_amount_minor, currency)],
            [
                Paragraph("<b>Amount paid</b>", body),
                Paragraph(
                    f"<b>{_money(invoice.total_amount_minor, currency)}</b>", right
                ),
            ],
        ]
    )
    totals_table = Table(totals, colWidths=[88 * mm, 40 * mm], hAlign="RIGHT")
    totals_table.setStyle(
        TableStyle(
            [
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("LINEABOVE", (0, -2), (-1, -2), 0.6, colors.black),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
            ]
        )
    )
    story.extend(
        [
            KeepTogether(totals_table),
            Spacer(1, 11 * mm),
            Paragraph("<b>Payment history</b>", styles["Heading2"]),
            Spacer(1, 3 * mm),
        ]
    )
    history = Table(
        [
            ["Payment method", "Date", "Amount paid", "Receipt number"],
            [
                str(payment.get("method", "Online payment")).title(),
                _date(payload.get("paid_at")),
                _money(invoice.total_amount_minor, currency),
                invoice.receipt_number,
            ],
        ],
        colWidths=[55 * mm, 40 * mm, 38 * mm, 37 * mm],
    )
    history.setStyle(
        TableStyle(
            [
                ("LINEBELOW", (0, 0), (-1, 0), 0.6, colors.black),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(history)
    if invoice.document_kind == "export_receipt" and seller.get("lut_reference"):
        story.extend(
            [
                Spacer(1, 8 * mm),
                Paragraph(
                    f"Export under LUT reference: {_safe(seller.get('lut_reference'))}",
                    small,
                ),
            ]
        )
    document.build(story)
    return output.getvalue()
