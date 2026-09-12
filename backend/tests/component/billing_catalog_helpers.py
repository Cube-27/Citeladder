"""Shared persisted-catalog fixtures for billing component tests."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.billing_settings import billing_settings
from app.domain.billing.catalog_revisions import (
    approved_phase1_payload,
    payload_digest,
    validate_payload,
)
from app.models.billing import BillingCatalogRevision
from app.models.user import User

# The seller of record on every invoice the billing tests produce. Five
# fixtures used to spell these nine values out; a GSTIN or SAC that disagrees
# between two of them is a tax bug the suite cannot see.
SELLER_SETTINGS: dict[str, str] = {
    "seller_legal_name": "CiteLadder Private Limited",
    "seller_legal_address": "1 Seller Street, Mumbai",
    "seller_email": "billing@citeladder.test",
    "seller_gstin": "27ABCDE1234F1Z5",
    "seller_gst_state_code": "27",
    "seller_gst_state_name": "Maharashtra",
    "seller_sac": "998313",
    "seller_lut_reference": "LUT/2026/001",
}


def seller_settings(**overrides: str) -> dict[str, str]:
    """The seller settings block, for `apply_billing_settings` or setattr."""
    return {**SELLER_SETTINGS, **overrides}


def apply_seller_settings(monkeypatch, **overrides: str) -> None:
    """Point `billing_settings` at the fixture seller."""
    for name, value in seller_settings(**overrides).items():
        monkeypatch.setattr(billing_settings, name, value)


def tax_snapshot(total_minor: int) -> dict[str, object]:
    return {
        "customer": {
            "name": "Fixture Buyer",
            "address_line1": "1 Test Road",
            "city": "New York",
            "state_code": None,
            "postal_code": "10001",
            "customer_gstin": None,
            "export_eligibility_attested": True,
        },
        "seller": {
            "legal_name": SELLER_SETTINGS["seller_legal_name"],
            "address": SELLER_SETTINGS["seller_legal_address"],
            "email": SELLER_SETTINGS["seller_email"],
            "gstin": SELLER_SETTINGS["seller_gstin"],
            "state_code": SELLER_SETTINGS["seller_gst_state_code"],
            "state_name": SELLER_SETTINGS["seller_gst_state_name"],
            "sac": SELLER_SETTINGS["seller_sac"],
            "lut_reference": SELLER_SETTINGS["seller_lut_reference"],
            "invoice_prefix": "CL",
        },
        "tax": {
            "subtotal_minor": total_minor,
            "discount_minor": 0,
            "taxable_minor": total_minor,
            "treatment": "EXPORT_ZERO_RATED",
            "tax_rate": "0",
            "cgst_minor": 0,
            "sgst_minor": 0,
            "igst_minor": 0,
            "tax_minor": 0,
            "total_minor": total_minor,
            "policy_version": 1,
        },
    }


async def publish_test_catalog(db_session: AsyncSession) -> None:
    payload = approved_phase1_payload()
    parsed = validate_payload(payload)
    actor = User(
        email=f"catalog-{uuid.uuid4()}@example.com", role="admin", is_active=True
    )
    db_session.add(actor)
    await db_session.flush()
    db_session.add(
        BillingCatalogRevision(
            revision=billing_settings.catalog_version,
            payload=payload,
            payload_sha256=payload_digest(parsed),
            publication_state="published",
            created_by_user_id=actor.id,
            created_reason="component fixture",
        )
    )
    await db_session.commit()
