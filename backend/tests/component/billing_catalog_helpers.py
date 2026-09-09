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
            "legal_name": "CiteLadder Private Limited",
            "address": "1 Seller Street, Mumbai",
            "email": "billing@citeladder.test",
            "gstin": "27ABCDE1234F1Z5",
            "state_code": "27",
            "state_name": "Maharashtra",
            "sac": "998313",
            "lut_reference": "LUT/2026/001",
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
