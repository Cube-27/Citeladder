"""Safe public billing request/response contracts."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class PriceResponse(BaseModel):
    region: Literal["india", "international"]
    currency: Literal["INR", "USD"]
    base_amount_minor: int
    tax_amount_minor: int
    total_amount_minor: int
    tax_label: str | None
    checkout_available: bool


class CatalogPlanResponse(BaseModel):
    tier_key: Literal["free", "paid", "enterprise"]
    name: str
    cadence: Literal["none", "monthly", "custom"]
    self_serve: bool
    description: str
    features: list[str]
    price: PriceResponse | None


class BillingCatalogResponse(BaseModel):
    catalog_version: str
    country_code: str | None
    plans: list[CatalogPlanResponse]


class BillingProfileUpdate(BaseModel):
    country_code: str = Field(min_length=2, max_length=2)

    @field_validator("country_code")
    @classmethod
    def normalize_country(cls, value: str) -> str:
        normalized = value.strip().upper()
        if len(normalized) != 2 or not normalized.isalpha():
            raise ValueError("country_code must be an ISO 3166-1 alpha-2 code")
        return normalized


class BillingSummaryResponse(BaseModel):
    billing_account_id: uuid.UUID
    billing_country: str
    country_verification: str
    tier_key: Literal["free", "paid"]
    subscription_status: str | None
    current_period_end: datetime | None
    cancel_at_period_end: bool
    paid_through: datetime | None
    grace_until: datetime | None
    can_checkout: bool
    checkout_block_reason: str | None


class CheckoutRequest(BaseModel):
    tier_key: Literal["paid"]
    cadence: Literal["monthly"]


class CheckoutResponse(BaseModel):
    checkout_url: str
    expires_at: datetime


class CancelResponse(BaseModel):
    status: str
    cancel_at_period_end: bool


class ManageResponse(BaseModel):
    management_url: None = None
    can_cancel: bool
    message: str


class WorkspaceEntitlementResponse(BaseModel):
    workspace_id: uuid.UUID
    tier_key: Literal["free", "paid"]
    capability_revision: int
    audit_web_search: bool
    audit_scheduling: bool
    site_health_capability: Literal["free", "starter"]
    paid_through: datetime | None
    grace_until: datetime | None
